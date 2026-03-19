const { buildShoppingList, loadRecipes, shoppingListMarkdown } = require("./_lib/recipes");
const { jsonResponse } = require("./_lib/supabase");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_err) {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }
  if (!body || !Array.isArray(body.recipeIds)) {
    return jsonResponse(400, { error: "recipeIds must be an array." });
  }

  const allRecipes = loadRecipes();
  const byId = new Map(allRecipes.map((r) => [r.id, r]));
  const selected = [];
  for (const id of body.recipeIds) {
    if (typeof id !== "string") continue;
    const recipe = byId.get(id);
    if (recipe) selected.push(recipe);
  }
  if (!selected.length) {
    return jsonResponse(400, { error: "No valid recipes selected." });
  }

  const { consolidated, asNeeded } = buildShoppingList(selected);
  const selectedTitles = selected.map((r) => r.title);
  const markdown = shoppingListMarkdown(selectedTitles, consolidated, asNeeded);

  return jsonResponse(200, {
    selected: selectedTitles,
    consolidated,
    asNeeded,
    markdown,
    savedFile: "Generated on-demand (Netlify function)",
  });
};
