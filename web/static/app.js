const recipesGrid = document.getElementById("recipesGrid");
const selectionCount = document.getElementById("selectionCount");
const generateBtn = document.getElementById("generateBtn");
const shoppingOutput = document.getElementById("shoppingOutput");
const savedFile = document.getElementById("savedFile");
const recipeCardTemplate = document.getElementById("recipeCardTemplate");
const stateHint = document.getElementById("stateHint");

let recipes = [];
const selectedIds = new Set();
let recipeStates = {};
let statePersistenceEnabled = false;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateSelectionUi() {
  const count = selectedIds.size;
  selectionCount.textContent = `${count} selected`;
  generateBtn.disabled = count === 0;
}

function setStars(starButtons, rating) {
  for (const button of starButtons) {
    const value = Number(button.dataset.rating);
    button.classList.toggle("active", value <= (rating || 0));
  }
}

function setCompleteButton(completeBtn, completed) {
  if (completed) {
    completeBtn.textContent = "Completed";
    completeBtn.classList.add("done");
  } else {
    completeBtn.textContent = "Mark Complete";
    completeBtn.classList.remove("done");
  }
}

async function saveRecipeState(recipeId, patch) {
  const response = await fetch("/api/recipe-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId, ...patch }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to save recipe state.");
  }
  return payload.state;
}

function renderRecipes() {
  recipesGrid.innerHTML = "";
  if (recipes.length === 0) {
    recipesGrid.innerHTML = '<p class="muted">No dinners found yet in recipes/claude.</p>';
    return;
  }

  for (const recipe of recipes) {
    const node = recipeCardTemplate.content.cloneNode(true);
    const checkbox = node.querySelector(".recipe-checkbox");
    const image = node.querySelector(".recipe-image");
    const title = node.querySelector(".recipe-title");
    const meta = node.querySelector(".recipe-meta");
    const completeBtn = node.querySelector(".complete-btn");
    const starButtons = node.querySelectorAll(".star-btn");

    checkbox.value = recipe.id;
    checkbox.checked = selectedIds.has(recipe.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedIds.add(recipe.id);
      } else {
        selectedIds.delete(recipe.id);
      }
      updateSelectionUi();
    });

    title.textContent = recipe.title;
    if (recipe.image) {
      image.src = recipe.image;
      image.alt = recipe.title;
    } else {
      image.style.display = "none";
    }
    const servings = recipe.servings ? `${recipe.servings} servings` : "Servings not set";
    meta.textContent = `${servings} · ${recipe.ingredientCount} ingredients`;
    const state = recipeStates[recipe.id] || { rating: null, completed: false };
    setCompleteButton(completeBtn, Boolean(state.completed));
    setStars(starButtons, state.rating);

    if (!statePersistenceEnabled) {
      completeBtn.disabled = true;
      for (const btn of starButtons) {
        btn.disabled = true;
      }
    } else {
      completeBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = recipeStates[recipe.id] || { completed: false };
        const nextCompleted = !Boolean(current.completed);
        setCompleteButton(completeBtn, nextCompleted);
        try {
          const savedState = await saveRecipeState(recipe.id, { completed: nextCompleted });
          recipeStates[recipe.id] = { ...(recipeStates[recipe.id] || {}), ...savedState };
          setCompleteButton(completeBtn, Boolean(savedState.completed));
        } catch (error) {
          setCompleteButton(completeBtn, Boolean(current.completed));
          stateHint.textContent = error.message;
        }
      });

      for (const btn of starButtons) {
        btn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const rating = Number(btn.dataset.rating);
          const current = recipeStates[recipe.id] || { rating: null };
          setStars(starButtons, rating);
          try {
            const savedState = await saveRecipeState(recipe.id, { rating });
            recipeStates[recipe.id] = { ...(recipeStates[recipe.id] || {}), ...savedState };
            setStars(starButtons, savedState.rating);
          } catch (error) {
            setStars(starButtons, current.rating);
            stateHint.textContent = error.message;
          }
        });
      }
    }

    recipesGrid.appendChild(node);
  }
}

function sectionHtml(title, items) {
  if (!items || items.length === 0) {
    return "";
  }

  const rows = items
    .map((item) => `<li><input type="checkbox" /> <span>${escapeHtml(item)}</span></li>`)
    .join("");

  return `
    <section class="category">
      <h3>${escapeHtml(title)}</h3>
      <ul class="items">${rows}</ul>
    </section>
  `;
}

function renderShoppingList(payload) {
  const categories = ["Produce", "Meat and Seafood", "Dairy and Eggs", "Pantry and Spices", "Other"];
  const sections = [];

  for (const category of categories) {
    sections.push(sectionHtml(category, payload.consolidated[category]));
  }
  for (const category of categories) {
    sections.push(sectionHtml(`${category} (As Needed)`, payload.asNeeded[category]));
  }

  const selected = payload.selected.map((title) => `<span class="chip">${escapeHtml(title)}</span>`).join(" ");
  shoppingOutput.innerHTML = `
    <div>${selected || ""}</div>
    ${sections.filter(Boolean).join("") || '<p class="muted">No ingredients found.</p>'}
  `;
  savedFile.textContent = `Saved to ${payload.savedFile}`;
}

async function loadRecipes() {
  const response = await fetch("/api/recipes");
  if (!response.ok) {
    throw new Error("Failed to load recipes.");
  }
  const payload = await response.json();
  recipes = payload.recipes || [];
}

async function loadRecipeStates() {
  try {
    const response = await fetch("/api/recipe-states");
    const payload = await response.json();
    if (!response.ok) {
      statePersistenceEnabled = false;
      stateHint.textContent = payload.error || "Supabase state is unavailable.";
      return;
    }
    recipeStates = payload.states || {};
    statePersistenceEnabled = true;
    stateHint.textContent = "Ratings and completion are synced to Supabase.";
  } catch (_error) {
    statePersistenceEnabled = false;
    stateHint.textContent = "Supabase state is unavailable.";
  }
}

async function generateShoppingList() {
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  try {
    const response = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeIds: [...selectedIds] }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate shopping list.");
    }
    renderShoppingList(payload);
  } catch (error) {
    shoppingOutput.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    generateBtn.textContent = "Generate Shopping List";
    updateSelectionUi();
  }
}

generateBtn.addEventListener("click", generateShoppingList);

Promise.all([loadRecipes(), loadRecipeStates()])
  .then(() => {
    renderRecipes();
    updateSelectionUi();
  })
  .catch((error) => {
    recipesGrid.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  });
