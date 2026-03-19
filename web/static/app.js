const weeksWrap = document.getElementById("weeksWrap");
const selectionCount = document.getElementById("selectionCount");
const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");
const shoppingOutput = document.getElementById("shoppingOutput");
const savedFile = document.getElementById("savedFile");
const recipeCardTemplate = document.getElementById("recipeCardTemplate");
const stateHint = document.getElementById("stateHint");
const recipeModal = document.getElementById("recipeModal");
const closeRecipeModal = document.getElementById("closeRecipeModal");
const modalImage = document.getElementById("modalImage");
const recipeModalTitle = document.getElementById("recipeModalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalIngredients = document.getElementById("modalIngredients");
const modalInstructions = document.getElementById("modalInstructions");
const editRecipeBtn = document.getElementById("editRecipeBtn");
const recipeReadView = document.getElementById("recipeReadView");
const recipeEditForm = document.getElementById("recipeEditForm");
const editTitle = document.getElementById("editTitle");
const editImage = document.getElementById("editImage");
const editServings = document.getElementById("editServings");
const editPrepTime = document.getElementById("editPrepTime");
const editCookTime = document.getElementById("editCookTime");
const editIngredients = document.getElementById("editIngredients");
const editInstructions = document.getElementById("editInstructions");
const cancelEditRecipeBtn = document.getElementById("cancelEditRecipeBtn");
const saveEditRecipeBtn = document.getElementById("saveEditRecipeBtn");

let recipes = [];
const selectedIds = new Set();
let recipeStates = {};
let statePersistenceEnabled = false;
let latestShoppingMarkdown = "";
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let activeRecipeId = null;
let editMode = false;

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
  downloadBtn.disabled = !latestShoppingMarkdown;
}

function chunkRecipes(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

async function saveRecipeEdits(recipeId, patch) {
  const response = await fetch("/api/recipe-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId, ...patch }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to save recipe changes.");
  }
  return payload.override;
}

function setEditMode(enabled) {
  editMode = enabled;
  recipeReadView.classList.toggle("hidden", enabled);
  recipeEditForm.classList.toggle("hidden", !enabled);
  editRecipeBtn.textContent = enabled ? "Editing..." : "Edit Recipe";
  editRecipeBtn.disabled = enabled;
}

function openRecipeModal(recipe) {
  activeRecipeId = recipe.id;
  recipeModalTitle.textContent = recipe.title;
  const metaParts = [];
  if (recipe.servings) metaParts.push(`${recipe.servings} servings`);
  if (recipe.prepTime) metaParts.push(`Prep: ${recipe.prepTime}`);
  if (recipe.cookTime) metaParts.push(`Cook: ${recipe.cookTime}`);
  modalMeta.textContent = metaParts.join(" · ");

  if (recipe.image) {
    modalImage.src = recipe.image;
    modalImage.alt = recipe.title;
    modalImage.style.display = "block";
  } else {
    modalImage.removeAttribute("src");
    modalImage.style.display = "none";
  }

  modalIngredients.innerHTML = "";
  for (const ingredient of recipe.ingredients || []) {
    const li = document.createElement("li");
    li.textContent = ingredient;
    modalIngredients.appendChild(li);
  }

  modalInstructions.innerHTML = "";
  const steps = recipe.instructions || [];
  if (steps.length) {
    for (const step of steps) {
      const li = document.createElement("li");
      li.textContent = step;
      modalInstructions.appendChild(li);
    }
  } else {
    const li = document.createElement("li");
    li.textContent = "Instructions were not found in this recipe file yet.";
    modalInstructions.appendChild(li);
  }

  recipeModal.classList.remove("hidden");
  setEditMode(false);
}

function renderRecipes() {
  weeksWrap.innerHTML = "";
  if (recipes.length === 0) {
    weeksWrap.innerHTML = '<p class="muted">No dinners found yet in recipe files.</p>';
    return;
  }

  const weeks = chunkRecipes(recipes, 7);
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
    const weekRecipes = weeks[weekIndex];
    const weekSection = document.createElement("section");
    weekSection.className = "week-section";

    const weekTitle = document.createElement("div");
    weekTitle.className = "week-title";
    weekTitle.textContent = `Week ${weekIndex + 1}`;
    weekSection.appendChild(weekTitle);

    const weekTheme = document.createElement("div");
    weekTheme.className = "week-theme";
    weekTheme.textContent = "Weekly dinner plan";
    weekSection.appendChild(weekTheme);

    const weekGrid = document.createElement("div");
    weekGrid.className = "week-grid";

    for (let i = 0; i < weekRecipes.length; i += 1) {
      const recipe = weekRecipes[i];
      const node = recipeCardTemplate.content.cloneNode(true);
      const checkbox = node.querySelector(".recipe-checkbox");
      const day = node.querySelector(".card-day");
      const image = node.querySelector(".recipe-image");
      const nameBtn = node.querySelector(".recipe-open-link");
      const meta = node.querySelector(".recipe-meta");
      const completeBtn = node.querySelector(".complete-btn");
      const starButtons = node.querySelectorAll(".star-btn");

      day.textContent = dayNames[i] || `Day ${i + 1}`;
      nameBtn.textContent = recipe.title;
      nameBtn.addEventListener("click", () => openRecipeModal(recipe));

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

      if (recipe.image) {
        image.src = recipe.image;
        image.alt = recipe.title;
      } else {
        image.style.display = "none";
      }

      const metaParts = [];
      if (recipe.servings) metaParts.push(`${recipe.servings} servings`);
      if (recipe.cookTime) metaParts.push(`Cook: ${recipe.cookTime}`);
      metaParts.push(`${recipe.ingredientCount} ingredients`);
      meta.textContent = metaParts.join(" · ");

      const state = recipeStates[recipe.id] || { rating: null, completed: false };
      setCompleteButton(completeBtn, Boolean(state.completed));
      setStars(starButtons, state.rating);

      if (!statePersistenceEnabled) {
        completeBtn.disabled = true;
        for (const btn of starButtons) btn.disabled = true;
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
      weekGrid.appendChild(node);
    }
    weekSection.appendChild(weekGrid);
    weeksWrap.appendChild(weekSection);
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
  latestShoppingMarkdown = payload.markdown || "";
  savedFile.textContent = payload.savedFile ? `Saved to ${payload.savedFile}` : "List ready to download.";
  updateSelectionUi();
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

function downloadShoppingList() {
  if (!latestShoppingMarkdown) return;
  const blob = new Blob([latestShoppingMarkdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shopping-list-${stamp}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

generateBtn.addEventListener("click", generateShoppingList);
downloadBtn.addEventListener("click", downloadShoppingList);

Promise.all([loadRecipes(), loadRecipeStates()])
  .then(() => {
    renderRecipes();
    updateSelectionUi();
  })
  .catch((error) => {
    weeksWrap.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  });

closeRecipeModal.addEventListener("click", () => {
  recipeModal.classList.add("hidden");
  activeRecipeId = null;
  setEditMode(false);
});

recipeModal.addEventListener("click", (event) => {
  if (event.target === recipeModal) {
    recipeModal.classList.add("hidden");
    activeRecipeId = null;
    setEditMode(false);
  }
});

editRecipeBtn.addEventListener("click", () => {
  if (!activeRecipeId) return;
  const recipe = recipes.find((item) => item.id === activeRecipeId);
  if (!recipe) return;
  editTitle.value = recipe.title || "";
  editImage.value = recipe.image || "";
  editServings.value = recipe.servings || "";
  editPrepTime.value = recipe.prepTime || "";
  editCookTime.value = recipe.cookTime || "";
  editIngredients.value = (recipe.ingredients || []).join("\n");
  editInstructions.value = (recipe.instructions || []).join("\n");
  setEditMode(true);
});

cancelEditRecipeBtn.addEventListener("click", () => {
  setEditMode(false);
});

recipeEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeRecipeId) return;
  saveEditRecipeBtn.disabled = true;
  saveEditRecipeBtn.textContent = "Saving...";

  const patch = {
    title: editTitle.value.trim(),
    image: editImage.value.trim(),
    servings: editServings.value.trim(),
    prepTime: editPrepTime.value.trim(),
    cookTime: editCookTime.value.trim(),
    ingredients: editIngredients.value
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean),
    instructions: editInstructions.value
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean),
  };

  try {
    await saveRecipeEdits(activeRecipeId, patch);
    const recipe = recipes.find((item) => item.id === activeRecipeId);
    if (recipe) {
      recipe.title = patch.title || recipe.title;
      recipe.image = patch.image || null;
      recipe.servings = patch.servings || null;
      recipe.prepTime = patch.prepTime || null;
      recipe.cookTime = patch.cookTime || null;
      recipe.ingredients = patch.ingredients;
      recipe.instructions = patch.instructions;
      recipe.ingredientCount = recipe.ingredients.length;
      openRecipeModal(recipe);
      renderRecipes();
      updateSelectionUi();
    }
  } catch (error) {
    stateHint.textContent = error.message;
  } finally {
    saveEditRecipeBtn.disabled = false;
    saveEditRecipeBtn.textContent = "Save Changes";
  }
});
