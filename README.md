# Recipe Vault

A simple place to store and organize recipes you get from Claude.

## Folder layout

- `recipes/claude/` - cleaned, final recipes in Markdown (one file per recipe)
- `recipes/raw-html/` - raw HTML exports or copied files
- `recipes/templates/` - reusable templates
- `recipes/index.md` - quick index of everything

## Recommended workflow

1. Drop any raw Claude export into `recipes/raw-html/`.
2. Copy `recipes/templates/recipe-template.md` for a new recipe.
3. Save the new recipe in `recipes/claude/` with a clear filename:
   - `YYYY-MM-DD-recipe-name.md`
4. Add one line for it in `recipes/index.md`.

This keeps your originals and your cleaned recipe files separate.

## Meal planner (Mealime-style)

You can select multiple dinners and generate one combined shopping list:

1. Make sure your recipes are in `recipes/claude/` and have an `## Ingredients` section with bullet items.
2. Run:
   - `python meal_planner.py`
3. Enter dinner numbers (example: `1,3,4`).
4. A consolidated list is generated at:
   - `shopping-list.md`

Optional:

- Use a custom output file:
  - `python meal_planner.py --output weekly-order.md`

## Mobile-friendly web UI

For a professional, phone-friendly interface:

1. Start the web app:
   - `python meal_planner_web.py`
2. Open in your browser:
   - `http://127.0.0.1:8787`
3. Select dinners and tap **Generate Shopping List**.
4. A saved copy is created in:
   - `shopping-lists/`

To use on your phone (same Wi-Fi):

- Run:
  - `python meal_planner_web.py --host 0.0.0.0 --port 8787`
- Open `http://YOUR_COMPUTER_IP:8787` on your phone browser.

## Supabase (ratings and completion tracking)

The web app can persist recipe state (star rating + completed status) in Supabase.

1. In Supabase SQL editor, run:
   - `supabase/schema.sql`
2. Copy env template and fill values:
   - `copy .env.example .env`
   - set `SUPABASE_URL`
   - set `SUPABASE_ANON_KEY`
3. Restart the web app:
   - `python meal_planner_web.py`

When configured, the dinner cards show interactive:

- star rating (1-5)
- Mark Complete / Completed toggle

## Netlify deployment (serverless backend)

This repo now includes Netlify Functions in `netlify/functions/` for:

- `GET /api/recipes`
- `POST /api/shopping-list`
- `GET /api/recipe-states`
- `POST /api/recipe-state`
- `POST /api/recipe-edit`

Deployment config is in `netlify.toml`:

- static publish dir: `web`
- functions dir: `netlify/functions`
- recipes included in function bundle: `recipes/claude/**/*.md`

### Netlify environment variables

Add these in Netlify Site Settings -> Environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Then trigger a redeploy.

### Notes

- Netlify Functions are stateless, so shopping lists are generated on demand.
- The app now returns downloadable markdown for each generated list.
- Local image paths like `file:///...` do not work on Netlify. Use `https://...` or site-relative image paths.
- Recipe edits (title/image/times/ingredients/instructions) are stored in Supabase overrides.

### Supabase schema updates

If you already applied `supabase/schema.sql` before, run it again so the `recipe_overrides` table/policies are created.
