const { loadRecipes } = require("./_lib/recipes");
const { fetchRecipeOverrides } = require("./_lib/supabase");

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findRecipe(slug) {
  const clean = decodeURIComponent((slug || "").trim().replace(/\/+$/g, "").replace(/^\/+/g, ""));
  if (!clean) return null;
  const recipes = loadRecipes();
  let recipe = recipes.find((item) => item.id === clean);
  if (recipe) return recipe;
  // Friendly fallback for dated markdown ids:
  // 2026-03-19-greek-ground-beef-skillet -> greek-ground-beef-skillet
  const noDate = clean.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  recipe = recipes.find((item) => item.id === noDate);
  return recipe || null;
}

function buildJsonLd(recipe) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    image: recipe.image || undefined,
    recipeYield: recipe.servings || undefined,
    prepTime: recipe.prepTime || undefined,
    cookTime: recipe.cookTime || undefined,
    recipeIngredient: recipe.ingredients || [],
    recipeInstructions: (recipe.instructions || []).map((step) => ({
      "@type": "HowToStep",
      text: step,
    })),
  };
}

function renderRecipePage(recipe, url) {
  const ingredientItems = recipe.ingredients || [];
  const instructionItems = recipe.instructions || [];
  const ingredients = ingredientItems
    .map((item) => `<li itemprop="recipeIngredient">${htmlEscape(item)}</li>`)
    .join("");
  const instructions = instructionItems
    .map((item, index) => `<li itemprop="recipeInstructions"><span class="step-num">${index + 1}.</span> ${htmlEscape(item)}</li>`)
    .join("");
  const ingredientsPlain = ingredientItems.map((item) => `- ${item}`).join("\n");
  const instructionsPlain = instructionItems.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const metaParts = [];
  if (recipe.servings) metaParts.push(`${htmlEscape(recipe.servings)} servings`);
  if (recipe.prepTime) metaParts.push(`Prep: ${htmlEscape(recipe.prepTime)}`);
  if (recipe.cookTime) metaParts.push(`Cook: ${htmlEscape(recipe.cookTime)}`);
  const meta = metaParts.join(" · ");
  const imageTag = recipe.image
    ? `<img src="${htmlEscape(recipe.image)}" alt="${htmlEscape(recipe.title)}" style="width:100%;max-height:320px;object-fit:cover;border-radius:8px;background:#ddd;">`
    : "";
  const jsonLd = JSON.stringify(buildJsonLd(recipe)).replace(/<\/script/gi, "<\\/script");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${htmlEscape(recipe.title)}</title>
  <meta name="description" content="Recipe import page for ${htmlEscape(recipe.title)}">
  <link rel="canonical" href="${htmlEscape(url)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    body { margin:0; background:#faf6ee; color:#2c2416; font-family: Arial, sans-serif; }
    main { max-width:860px; margin:24px auto; padding:0 14px 28px; }
    h1 { margin:0 0 8px; font-size:34px; color:#1c2b3a; }
    .meta { margin:0 0 14px; color:#6b5e4e; font-size:14px; }
    .card { background:#fff; border:1px solid rgba(28,43,58,.14); border-radius:10px; padding:14px; margin-top:12px; }
    h2 { color:#1c2b3a; margin:10px 0 8px; font-size:22px; }
    ul, ol { margin:0; padding-left:22px; line-height:1.7; }
    li { margin:4px 0; }
    .step-num { font-weight:700; margin-right:4px; }
    .import-plain { margin-top:12px; background:#fbf8f2; border:1px solid rgba(28,43,58,.14); border-radius:8px; padding:10px; }
    .import-plain h3 { margin:0 0 6px; color:#1c2b3a; font-size:16px; }
    .import-plain pre { margin:0; white-space:pre-wrap; font-size:14px; line-height:1.55; font-family: Arial, sans-serif; }
    .top-link { display:inline-block; margin-bottom:12px; color:#c4622d; text-decoration:none; font-weight:600; }
  </style>
</head>
<body>
  <main>
    <a class="top-link" href="/recipes/${htmlEscape(recipe.id)}">← Back to recipe</a>
    <h1>${htmlEscape(recipe.title)}</h1>
    <p class="meta">${meta}</p>
    ${imageTag}
    <section class="card" itemscope itemtype="https://schema.org/Recipe">
      <h2>Ingredients</h2>
      <ul>${ingredients || "<li>No ingredients listed.</li>"}</ul>
      <h2>Instructions</h2>
      <ol>${instructions || "<li>No instructions listed.</li>"}</ol>
      <div class="import-plain">
        <h3>Ingredients (Plain Text)</h3>
        <pre>${htmlEscape(ingredientsPlain || "No ingredients listed.")}</pre>
      </div>
      <div class="import-plain">
        <h3>Instructions (Plain Text)</h3>
        <pre>${htmlEscape(instructionsPlain || "No instructions listed.")}</pre>
      </div>
    </section>
  </main>
</body>
</html>`;
}

exports.handler = async function handler(event) {
  const path = event.path || "";
  const match = path.match(/\/mealime\/(.+)$/);
  const slug = match ? match[1] : "";
  const recipe = findRecipe(slug);
  if (!recipe) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "<h1>Recipe not found</h1>",
    };
  }

  // Apply any saved overrides
  try {
    const overrides = await fetchRecipeOverrides([recipe.id]);
    const override = overrides[recipe.id];
    if (override) {
      if (override.title) recipe.title = override.title;
      if (override.image) recipe.image = override.image;
      if (override.servings) recipe.servings = override.servings;
      if (override.prepTime) recipe.prepTime = override.prepTime;
      if (override.cookTime) recipe.cookTime = override.cookTime;
      if (override.ingredients) recipe.ingredients = override.ingredients;
      if (override.instructions) recipe.instructions = override.instructions;
    }
  } catch (_) {}

  const url = event.rawUrl || "";
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: renderRecipePage(recipe, url),
  };
};
