const { jsonResponse, upsertRecipeState } = require("./_lib/supabase");

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

  const recipeId = typeof body.recipeId === "string" ? body.recipeId.trim() : "";
  if (!recipeId) {
    return jsonResponse(400, { error: "recipeId is required." });
  }

  const hasRating = body.rating !== undefined;
  const hasCompleted = body.completed !== undefined;
  if (!hasRating && !hasCompleted) {
    return jsonResponse(400, { error: "Send rating or completed." });
  }

  let rating;
  if (hasRating) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return jsonResponse(400, { error: "rating must be an integer between 1 and 5." });
    }
    rating = body.rating;
  }

  let completed;
  if (hasCompleted) {
    if (typeof body.completed !== "boolean") {
      return jsonResponse(400, { error: "completed must be a boolean." });
    }
    completed = body.completed;
  }

  try {
    const state = await upsertRecipeState(recipeId, rating, completed);
    return jsonResponse(200, { recipeId, state });
  } catch (err) {
    return jsonResponse(503, { error: err.message || "Failed to save recipe state." });
  }
};
