const { jsonResponse } = require("./_lib/supabase");
const { loadRecipes } = require("./_lib/recipes");

exports.handler = async function handler() {
  try {
    const recipes = loadRecipes().map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      servings: recipe.servings,
      image: recipe.image,
      ingredientCount: recipe.ingredients.length,
    }));
    return jsonResponse(200, { recipes });
  } catch (err) {
    return jsonResponse(500, { error: err.message || "Failed to load recipes." });
  }
};
