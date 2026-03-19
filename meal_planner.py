#!/usr/bin/env python3
"""
Simple Mealime-style planner for Markdown recipes.

Usage:
  python meal_planner.py
  python meal_planner.py --output my-shopping-list.md
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent
RECIPES_DIR = ROOT / "recipes" / "claude"

UNIT_ALIASES = {
    "teaspoon": "tsp",
    "teaspoons": "tsp",
    "tsp": "tsp",
    "tablespoon": "tbsp",
    "tablespoons": "tbsp",
    "tbsp": "tbsp",
    "cup": "cup",
    "cups": "cup",
    "oz": "oz",
    "ounce": "oz",
    "ounces": "oz",
    "lb": "lb",
    "lbs": "lb",
    "pound": "lb",
    "pounds": "lb",
    "clove": "clove",
    "cloves": "clove",
    "bag": "bag",
    "bags": "bag",
    "can": "can",
    "cans": "can",
}

CATEGORIES = {
    "Produce": [
        "spinach",
        "tomato",
        "lemon",
        "cucumber",
        "onion",
        "garlic",
        "parsley",
        "dill",
        "pepper",
        "zucchini",
        "broccoli",
        "cauliflower",
    ],
    "Meat and Seafood": ["beef", "chicken", "turkey", "pork", "shrimp", "salmon", "fish"],
    "Dairy and Eggs": ["feta", "yogurt", "cheese", "milk", "cream", "butter", "egg"],
    "Pantry and Spices": [
        "olive oil",
        "oil",
        "salt",
        "paprika",
        "oregano",
        "cumin",
        "rice",
        "flour",
        "vinegar",
        "olives",
    ],
}

QUANTITY_PATTERN = re.compile(
    r"^\s*(?P<qty>\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)"
    r"(?:\s+(?P<unit>[A-Za-z]+))?"
    r"\s+(?P<name>.+?)\s*$"
)


@dataclass
class Recipe:
    title: str
    path: Path
    servings: str | None
    image: str | None
    ingredients: list[str]


@dataclass
class ParsedIngredient:
    raw: str
    name: str
    quantity: Fraction | None
    unit: str | None


def parse_frontmatter(lines: list[str]) -> dict[str, str]:
    if len(lines) < 3 or lines[0].strip() != "---":
        return {}
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}
    data: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def extract_ingredients(lines: list[str]) -> list[str]:
    ingredients: list[str] = []
    in_ingredients = False
    for line in lines:
        stripped = line.strip()
        if stripped.lower().startswith("## ingredients"):
            in_ingredients = True
            continue
        if in_ingredients and stripped.startswith("## "):
            break
        if not in_ingredients:
            continue
        if stripped.startswith("- "):
            item = stripped[2:].strip()
            if item:
                ingredients.append(item)
    return ingredients


def load_recipe(path: Path) -> Recipe:
    lines = path.read_text(encoding="utf-8").splitlines()
    fm = parse_frontmatter(lines)
    title = fm.get("title")
    if not title:
        title = path.stem
        for line in lines:
            if line.startswith("# "):
                title = line[2:].strip()
                break
    servings = fm.get("servings")
    image = fm.get("image")
    ingredients = extract_ingredients(lines)
    return Recipe(title=title, path=path, servings=servings, image=image, ingredients=ingredients)


def read_fraction(value: str) -> Fraction:
    value = value.strip()
    if " " in value:
        whole, frac = value.split(" ", 1)
        return Fraction(int(whole), 1) + Fraction(frac)
    return Fraction(value)


def clean_name(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def normalize_name(text: str) -> str:
    value = text.lower().strip()
    value = value.replace("to taste", "").strip(", ").strip()
    value = re.sub(r"\s+", " ", value)
    return value


def parse_ingredient(line: str) -> ParsedIngredient:
    match = QUANTITY_PATTERN.match(line)
    if not match:
        return ParsedIngredient(raw=line, name=clean_name(line), quantity=None, unit=None)

    qty_str = match.group("qty")
    unit_raw = match.group("unit")
    name = clean_name(match.group("name"))

    try:
        quantity = read_fraction(qty_str)
    except (ValueError, ZeroDivisionError):
        return ParsedIngredient(raw=line, name=clean_name(line), quantity=None, unit=None)

    unit = None
    if unit_raw:
        unit = UNIT_ALIASES.get(unit_raw.lower(), unit_raw.lower())
    return ParsedIngredient(raw=line, name=name, quantity=quantity, unit=unit)


def format_fraction(value: Fraction) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    whole = value.numerator // value.denominator
    remainder = value - whole
    if whole > 0 and remainder > 0:
        return f"{whole} {remainder.numerator}/{remainder.denominator}"
    return f"{value.numerator}/{value.denominator}"


def categorize(name: str) -> str:
    low = name.lower()
    for category, words in CATEGORIES.items():
        if any(word in low for word in words):
            return category
    return "Other"


def select_recipes_interactive(recipes: list[Recipe]) -> list[Recipe]:
    print("\nAvailable dinners:\n")
    for i, recipe in enumerate(recipes, start=1):
        servings = f" ({recipe.servings} servings)" if recipe.servings else ""
        print(f"{i}. {recipe.title}{servings}")
    print("\nPick dinners (comma-separated numbers, e.g. 1,3,4):")
    raw = input("> ").strip()
    if not raw:
        raise ValueError("No dinners selected.")
    selected: list[Recipe] = []
    seen = set()
    for part in raw.split(","):
        idx = int(part.strip())
        if idx < 1 or idx > len(recipes):
            raise ValueError(f"Invalid selection: {idx}")
        if idx in seen:
            continue
        seen.add(idx)
        selected.append(recipes[idx - 1])
    return selected


def build_shopping_list(recipes: Iterable[Recipe]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    aggregated: dict[tuple[str, str | None], Fraction] = {}
    display_names: dict[tuple[str, str | None], str] = {}
    as_needed: dict[str, str] = {}

    for recipe in recipes:
        for line in recipe.ingredients:
            parsed = parse_ingredient(line)
            norm_name = normalize_name(parsed.name)
            if parsed.quantity is not None:
                key = (norm_name, parsed.unit)
                aggregated[key] = aggregated.get(key, Fraction(0)) + parsed.quantity
                display_names[key] = parsed.name
            else:
                as_needed.setdefault(norm_name, parsed.name)

    consolidated_by_category: dict[str, list[str]] = {}
    for (norm_name, unit), qty in sorted(aggregated.items(), key=lambda kv: kv[0][0]):
        name = display_names[(norm_name, unit)]
        unit_part = f" {unit}" if unit else ""
        line = f"{format_fraction(qty)}{unit_part} {name}"
        category = categorize(name)
        consolidated_by_category.setdefault(category, []).append(line)

    needed_by_category: dict[str, list[str]] = {}
    for _, name in sorted(as_needed.items(), key=lambda kv: kv[0]):
        category = categorize(name)
        needed_by_category.setdefault(category, []).append(name)

    return consolidated_by_category, needed_by_category


def write_markdown_output(
    selected: list[Recipe],
    consolidated: dict[str, list[str]],
    as_needed: dict[str, list[str]],
    output_path: Path,
) -> None:
    categories = ["Produce", "Meat and Seafood", "Dairy and Eggs", "Pantry and Spices", "Other"]
    today = dt.date.today().isoformat()
    lines: list[str] = []

    lines.append(f"# Shopping List ({today})")
    lines.append("")
    lines.append("## Selected Dinners")
    lines.append("")
    for recipe in selected:
        lines.append(f"- {recipe.title}")
    lines.append("")
    lines.append("## Consolidated Ingredients")
    lines.append("")

    if not consolidated:
        lines.append("- No quantified ingredients found.")
    else:
        for category in categories:
            items = consolidated.get(category)
            if not items:
                continue
            lines.append(f"### {category}")
            lines.append("")
            for item in items:
                lines.append(f"- [ ] {item}")
            lines.append("")

    lines.append("## Add As Needed")
    lines.append("")
    if not as_needed:
        lines.append("- None")
    else:
        for category in categories:
            items = as_needed.get(category)
            if not items:
                continue
            lines.append(f"### {category}")
            lines.append("")
            for item in items:
                lines.append(f"- [ ] {item}")
            lines.append("")

    output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a consolidated shopping list from dinners.")
    parser.add_argument(
        "--output",
        default=str(ROOT / "shopping-list.md"),
        help="Output Markdown path (default: shopping-list.md)",
    )
    args = parser.parse_args()

    if not RECIPES_DIR.exists():
        print(f"Recipe folder not found: {RECIPES_DIR}")
        return 1

    recipe_files = sorted(RECIPES_DIR.glob("*.md"))
    if not recipe_files:
        print(f"No recipes found in {RECIPES_DIR}")
        return 1

    recipes = [load_recipe(path) for path in recipe_files]
    try:
        selected = select_recipes_interactive(recipes)
    except ValueError as err:
        print(f"Selection error: {err}")
        return 1

    consolidated, as_needed = build_shopping_list(selected)
    output_path = Path(args.output).resolve()
    write_markdown_output(selected, consolidated, as_needed, output_path)

    print(f"\nShopping list created: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
