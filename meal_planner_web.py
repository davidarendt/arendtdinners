#!/usr/bin/env python3
"""
Mobile-friendly web UI for the meal planner.

Run:
  python meal_planner_web.py
  python meal_planner_web.py --host 0.0.0.0 --port 8787
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request
from urllib.parse import urlparse

from meal_planner import RECIPES_DIR, ROOT, build_shopping_list, load_recipe, write_markdown_output


WEB_DIR = ROOT / "web"
STATIC_DIR = WEB_DIR / "static"
SHOPPING_LISTS_DIR = ROOT / "shopping-lists"
ENV_PATH = ROOT / ".env"

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def list_recipes():
    recipe_files = sorted(RECIPES_DIR.glob("*.md"))
    return [load_recipe(path) for path in recipe_files]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


class SupabaseStateStore:
    def __init__(self, url: str | None, api_key: str | None):
        self.url = (url or "").rstrip("/")
        self.api_key = api_key or ""

    @property
    def configured(self) -> bool:
        return bool(self.url and self.api_key)

    def _request(self, method: str, path: str, payload: dict | None = None):
        if not self.configured:
            raise RuntimeError("Supabase is not configured.")
        body = None
        headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
            headers["Prefer"] = "return=representation"
        req = request.Request(f"{self.url}{path}", method=method, data=body, headers=headers)
        try:
            with request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8")
                if not text:
                    return None
                return json.loads(text)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Supabase HTTP {exc.code}: {detail}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Supabase network error: {exc.reason}") from exc

    def fetch_states(self, recipe_ids: list[str]) -> dict[str, dict]:
        if not recipe_ids:
            return {}
        quoted = ",".join(f'"{rid}"' for rid in recipe_ids)
        rows = self._request(
            "GET",
            (
                "/rest/v1/recipe_states"
                f"?select=recipe_id,rating,completed,completed_at,updated_at&recipe_id=in.({quoted})"
            ),
        )
        states: dict[str, dict] = {}
        for row in rows or []:
            recipe_id = row.get("recipe_id")
            if recipe_id:
                states[recipe_id] = {
                    "rating": row.get("rating"),
                    "completed": bool(row.get("completed", False)),
                    "completedAt": row.get("completed_at"),
                    "updatedAt": row.get("updated_at"),
                }
        return states

    def upsert_state(self, recipe_id: str, rating: int | None, completed: bool | None) -> dict:
        payload: dict[str, object] = {"recipe_id": recipe_id, "updated_at": iso_now()}
        if rating is not None:
            payload["rating"] = rating
        if completed is not None:
            payload["completed"] = completed
            payload["completed_at"] = iso_now() if completed else None
        rows = self._request(
            "POST",
            "/rest/v1/recipe_states?on_conflict=recipe_id",
            payload,
        )
        if not rows:
            return {"rating": rating, "completed": completed, "completedAt": payload.get("completed_at")}
        row = rows[0]
        return {
            "rating": row.get("rating"),
            "completed": bool(row.get("completed", False)),
            "completedAt": row.get("completed_at"),
            "updatedAt": row.get("updated_at"),
        }


def recipe_to_dict(recipe):
    image_url = None
    if recipe.image:
        image_url = f"/api/recipe-image/{recipe.path.stem}"
    return {
        "id": recipe.path.stem,
        "title": recipe.title,
        "servings": recipe.servings,
        "image": image_url,
        "ingredientCount": len(recipe.ingredients),
    }


def build_shopping_payload(selected_recipes):
    consolidated, as_needed = build_shopping_list(selected_recipes)
    categories = ["Produce", "Meat and Seafood", "Dairy and Eggs", "Pantry and Spices", "Other"]
    return {
        "selected": [recipe.title for recipe in selected_recipes],
        "consolidated": {category: consolidated.get(category, []) for category in categories},
        "asNeeded": {category: as_needed.get(category, []) for category in categories},
    }


class MealPlannerHandler(BaseHTTPRequestHandler):
    server_version = "MealPlannerHTTP/1.0"

    def _send_json(self, payload, status=200):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _send_file(self, file_path: Path):
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Not found")
            return
        suffix = file_path.suffix.lower()
        content_type = CONTENT_TYPES.get(suffix, "application/octet-stream")
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_image_file(self, file_path: Path):
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Image not found")
            return
        suffix = file_path.suffix.lower()
        content_type = CONTENT_TYPES.get(suffix, "application/octet-stream")
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if content_length <= 0:
            return None
        raw = self.rfile.read(content_length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def _supabase_unavailable(self):
        if self.server.state_store.configured:
            return False
        self._send_json(
            {"error": "Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env."},
            status=503,
        )
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self._send_file(WEB_DIR / "index.html")
            return
        if path.startswith("/static/"):
            rel = path[len("/static/") :].strip("/")
            safe = (STATIC_DIR / rel).resolve()
            if STATIC_DIR.resolve() not in safe.parents and safe != STATIC_DIR.resolve():
                self.send_error(403, "Forbidden")
                return
            self._send_file(safe)
            return
        if path == "/api/recipes":
            recipes = [recipe_to_dict(r) for r in list_recipes()]
            self._send_json({"recipes": recipes})
            return
        if path == "/api/recipe-states":
            if self._supabase_unavailable():
                return
            recipes = list_recipes()
            try:
                states = self.server.state_store.fetch_states([recipe.path.stem for recipe in recipes])
            except RuntimeError as err:
                self._send_json({"error": str(err)}, status=502)
                return
            self._send_json({"states": states})
            return
        if path.startswith("/api/recipe-image/"):
            recipe_id = path[len("/api/recipe-image/") :].strip()
            if not recipe_id:
                self.send_error(404, "Not found")
                return
            all_recipes = list_recipes()
            by_id = {recipe.path.stem: recipe for recipe in all_recipes}
            recipe = by_id.get(recipe_id)
            if not recipe or not recipe.image:
                self.send_error(404, "Not found")
                return

            image_value = recipe.image.strip()
            image_path: Path | None = None
            if image_value.startswith("file:///"):
                image_path = Path(image_value.replace("file:///", "", 1))
            else:
                candidate = (ROOT / image_value).resolve()
                if ROOT.resolve() in candidate.parents or candidate == ROOT.resolve():
                    image_path = candidate
            if image_path is None:
                self.send_error(400, "Invalid image path")
                return
            self._send_image_file(image_path)
            return
        if path == "/api/health":
            self._send_json({"ok": True})
            return

        self.send_error(404, "Not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/shopping-list":
            body = self._read_json_body()
            if not body or not isinstance(body, dict):
                self._send_json({"error": "Invalid JSON body."}, status=400)
                return

            recipe_ids = body.get("recipeIds")
            if not isinstance(recipe_ids, list):
                self._send_json({"error": "recipeIds must be an array."}, status=400)
                return

            all_recipes = list_recipes()
            by_id = {recipe.path.stem: recipe for recipe in all_recipes}

            selected = []
            for recipe_id in recipe_ids:
                if recipe_id in by_id:
                    selected.append(by_id[recipe_id])

            if not selected:
                self._send_json({"error": "No valid recipes selected."}, status=400)
                return

            payload = build_shopping_payload(selected)
            SHOPPING_LISTS_DIR.mkdir(parents=True, exist_ok=True)
            filename = dt.datetime.now().strftime("shopping-list-%Y%m%d-%H%M%S.md")
            output_path = SHOPPING_LISTS_DIR / filename
            consolidated, as_needed = build_shopping_list(selected)
            write_markdown_output(selected, consolidated, as_needed, output_path)

            payload["savedFile"] = str(output_path.relative_to(ROOT))
            self._send_json(payload)
            return

        if path == "/api/recipe-state":
            if self._supabase_unavailable():
                return
            body = self._read_json_body()
            if not body or not isinstance(body, dict):
                self._send_json({"error": "Invalid JSON body."}, status=400)
                return

            recipe_id = body.get("recipeId")
            if not isinstance(recipe_id, str) or not recipe_id.strip():
                self._send_json({"error": "recipeId is required."}, status=400)
                return

            rating = body.get("rating")
            completed = body.get("completed")
            rating_value = None
            completed_value = None

            if rating is not None:
                if not isinstance(rating, int) or rating < 1 or rating > 5:
                    self._send_json({"error": "rating must be an integer between 1 and 5."}, status=400)
                    return
                rating_value = rating

            if completed is not None:
                if not isinstance(completed, bool):
                    self._send_json({"error": "completed must be a boolean."}, status=400)
                    return
                completed_value = completed

            if rating is None and completed is None:
                self._send_json({"error": "Send rating or completed."}, status=400)
                return

            try:
                state = self.server.state_store.upsert_state(
                    recipe_id=recipe_id.strip(),
                    rating=rating_value,
                    completed=completed_value,
                )
            except RuntimeError as err:
                self._send_json({"error": str(err)}, status=502)
                return

            self._send_json({"recipeId": recipe_id, "state": state})
            return

        self.send_error(404, "Not found")


def main():
    parser = argparse.ArgumentParser(description="Run the web UI for meal planning.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8787, help="Port to bind (default: 8787)")
    args = parser.parse_args()
    load_env_file(ENV_PATH)

    if not WEB_DIR.exists():
        raise SystemExit(f"Missing web directory: {WEB_DIR}")

    server = ThreadingHTTPServer((args.host, args.port), MealPlannerHandler)
    server.state_store = SupabaseStateStore(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_ANON_KEY"),
    )
    print(f"Meal Planner UI running at http://{args.host}:{args.port}")
    if not server.state_store.configured:
        print("Supabase disabled: add SUPABASE_URL and SUPABASE_ANON_KEY to .env")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
