function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  return { url, anonKey };
}

function assertSupabaseConfigured() {
  const cfg = supabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }
  return cfg;
}

async function supabaseRequest(method, restPath, body) {
  const { url, anonKey } = assertSupabaseConfigured();
  const response = await fetch(`${url}${restPath}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchRecipeStates(recipeIds) {
  if (!recipeIds.length) return {};
  const quoted = recipeIds
    .map((id) => id.replace(/[^a-zA-Z0-9_.-]/g, ""))
    .filter(Boolean)
    .map((id) => `"${id}"`)
    .join(",");
  if (!quoted) return {};
  const rows = await supabaseRequest(
    "GET",
    `/rest/v1/recipe_states?select=recipe_id,rating,completed,completed_at,updated_at&recipe_id=in.(${encodeURIComponent(
      quoted
    )})`
  );
  const states = {};
  for (const row of rows || []) {
    states[row.recipe_id] = {
      rating: row.rating,
      completed: Boolean(row.completed),
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    };
  }
  return states;
}

async function upsertRecipeState(recipeId, rating, completed) {
  const payload = { recipe_id: recipeId, updated_at: new Date().toISOString() };
  if (rating !== undefined) payload.rating = rating;
  if (completed !== undefined) {
    payload.completed = completed;
    payload.completed_at = completed ? new Date().toISOString() : null;
  }
  const rows = await supabaseRequest("POST", "/rest/v1/recipe_states?on_conflict=recipe_id", payload);
  const row = (rows || [])[0] || payload;
  return {
    rating: row.rating ?? null,
    completed: Boolean(row.completed),
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || payload.updated_at,
  };
}

module.exports = {
  fetchRecipeStates,
  jsonResponse,
  upsertRecipeState,
};
