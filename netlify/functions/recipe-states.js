const { fetchRecipeStates, jsonResponse } = require("./_lib/supabase");
const { loadRecipes } = require("./_lib/recipes");

exports.handler = async function handler() {
  try {
    const recipeIds = loadRecipes().map((recipe) => recipe.id);
    const states = await fetchRecipeStates(recipeIds);
    return jsonResponse(200, { states });
  } catch (err) {
    return jsonResponse(503, { error: err.message || "Recipe states unavailable." });
  }
};
