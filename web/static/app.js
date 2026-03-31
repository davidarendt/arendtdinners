const homeView = document.getElementById("homeView");
const recipePage = document.getElementById("recipePage");
const weeksWrap = document.getElementById("weeksWrap");
const selectionCount = document.getElementById("selectionCount");
const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");
const shoppingOutput = document.getElementById("shoppingOutput");
const savedFile = document.getElementById("savedFile");
const recipeCardTemplate = document.getElementById("recipeCardTemplate");
const stateHint = document.getElementById("stateHint");
const backToPlanner = document.getElementById("backToPlanner");
const recipePageUrl = document.getElementById("recipePageUrl");
const mealimeImportUrl = document.getElementById("mealimeImportUrl");
const recipePageImage = document.getElementById("recipePageImage");
const recipePageTitle = document.getElementById("recipePageTitle");
const recipePageMeta = document.getElementById("recipePageMeta");
const recipePageIngredients = document.getElementById("recipePageIngredients");
const recipePageInstructions = document.getElementById("recipePageInstructions");
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
const recipeStats = document.getElementById("recipeStats");

let recipes = [];
let recipeById = new Map();
let activeRecipeId = null;
let editMode = false;
let recipeStates = {};
let statePersistenceEnabled = false;
const selectedIds = new Set();
let latestShoppingMarkdown = "";
let activeProteinFilter = "all";
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---- Protein tagging ----
function getProtein(id) {
  if (/frittata|shakshuka|baked-egg|bacon-egg|eggs-en-cocotte|egg-scramble|egg-fried/.test(id)) return "eggs";
  if (/duck/.test(id)) return "duck";
  if (/tofu/.test(id)) return "tofu";
  if (/lamb/.test(id)) return "lamb";
  if (/kielbasa|andouille|pork|pulled-pork|chorizo/.test(id)) return "pork";
  if (/turkey/.test(id)) return "turkey";
  if (/chicken/.test(id)) return "chicken";
  if (/beef|steak|bulgogi|smash-burger|chuck/.test(id)) return "beef";
  return "other";
}

// ---- Image placeholder helpers ----
const PLACEHOLDER_GRADIENTS = [
  ["#c4622d", "#d4a843"],
  ["#5a7a6e", "#d4a843"],
  ["#1c2b3a", "#c4622d"],
  ["#7a4030", "#c4622d"],
  ["#2d4a3e", "#5a7a6e"],
  ["#8b4513", "#d4a843"],
  ["#3d2b1f", "#c4622d"],
];

function placeholderGradient(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  const [a, b] = PLACEHOLDER_GRADIENTS[Math.abs(h) % PLACEHOLDER_GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function makePlaceholder(title, className) {
  const div = document.createElement("div");
  div.className = className;
  div.style.background = placeholderGradient(title);
  div.textContent = title.charAt(0).toUpperCase();
  return div;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateSelectionUi() {
  selectionCount.textContent = `${selectedIds.size} selected`;
  generateBtn.disabled = selectedIds.size === 0;
  downloadBtn.disabled = !latestShoppingMarkdown;
}

function applyFilter() {
  const sections = weeksWrap.querySelectorAll(".week-section");
  for (const section of sections) {
    const cards = section.querySelectorAll(".card");
    let visible = 0;
    for (const card of cards) {
      const protein = card.dataset.protein || "other";
      const hide = activeProteinFilter !== "all" && protein !== activeProteinFilter;
      card.classList.toggle("card--filtered", hide);
      if (!hide) visible++;
    }
    section.style.display = visible === 0 ? "none" : "";
  }
}

// Filter button wiring — runs after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const heroFilters = document.getElementById("heroFilters");
  if (!heroFilters) return;
  heroFilters.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    activeProteinFilter = btn.dataset.protein;
    for (const b of heroFilters.querySelectorAll(".filter-btn")) {
      b.classList.toggle("active", b === btn);
    }
    applyFilter();
  });
});

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

function setEditMode(enabled) {
  editMode = enabled;
  recipeReadView.classList.toggle("hidden", enabled);
  recipeEditForm.classList.toggle("hidden", !enabled);
  editRecipeBtn.disabled = enabled;
  editRecipeBtn.textContent = enabled ? "Editing..." : "Edit Recipe";
}

function recipePath(recipeId) {
  return `/recipes/${encodeURIComponent(recipeId)}`;
}

function mealimePath(recipeId) {
  return `/mealime/${encodeURIComponent(recipeId)}`;
}

function getRouteRecipeId() {
  const match = window.location.pathname.match(/^\/recipes\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function navigateTo(url) {
  window.history.pushState({}, "", url);
  renderRoute();
}

async function saveRecipeState(recipeId, patch) {
  const response = await fetch("/api/recipe-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId, ...patch }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Failed to save recipe state.");
  return payload.state;
}

async function saveRecipeEdits(recipeId, patch) {
  const response = await fetch("/api/recipe-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId, ...patch }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Failed to save recipe changes.");
  return payload.override;
}

function renderHome() {
  weeksWrap.innerHTML = "";
  if (!recipes.length) {
    weeksWrap.innerHTML = '<p class="muted">No dinners found yet in recipe files.</p>';
    return;
  }
  const weeks = chunkRecipes(recipes, 7);
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
    const weekSection = document.createElement("section");
    weekSection.className = "week-section";
    const weekNum = String(weekIndex + 1).padStart(2, "0");
    weekSection.innerHTML = `<div class="week-bg-num">${weekNum}</div><div class="week-header-row"><h3 class="week-title">Week ${weekIndex + 1}</h3><div class="week-line"></div></div>`;
    const weekGrid = document.createElement("div");
    weekGrid.className = "week-grid";
    const weekRecipes = weeks[weekIndex];
    for (let i = 0; i < weekRecipes.length; i += 1) {
      const recipe = weekRecipes[i];
      const node = recipeCardTemplate.content.cloneNode(true);
      const card = node.querySelector(".card");
      const checkbox = node.querySelector(".recipe-checkbox");
      const day = node.querySelector(".card-day");
      const imageEl = node.querySelector(".recipe-image");
      const imageWrap = node.querySelector(".card-image-wrap");
      const link = node.querySelector(".recipe-open-link");
      const meta = node.querySelector(".recipe-meta");
      const completeBtn = node.querySelector(".complete-btn");
      const starButtons = node.querySelectorAll(".star-btn");

      card.style.setProperty("--card-index", weekIndex * 7 + i);
      card.dataset.protein = getProtein(recipe.id);
      if (selectedIds.has(recipe.id)) card.classList.add("is-selected");

      day.textContent = dayNames[i] || `Day ${i + 1}`;
      link.textContent = recipe.title;
      link.href = recipePath(recipe.id);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        navigateTo(recipePath(recipe.id));
      });

      checkbox.value = recipe.id;
      checkbox.checked = selectedIds.has(recipe.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedIds.add(recipe.id);
          card.classList.add("is-selected");
        } else {
          selectedIds.delete(recipe.id);
          card.classList.remove("is-selected");
        }
        updateSelectionUi();
      });

      if (recipe.image) {
        imageEl.src = recipe.image;
        imageEl.alt = recipe.title;
      } else {
        imageEl.remove();
        imageWrap.appendChild(makePlaceholder(recipe.title, "recipe-image-placeholder"));
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
  applyFilter();
}

function renderRecipePage(recipe) {
  activeRecipeId = recipe ? recipe.id : null;
  // Clean up any previously injected placeholder
  const staleHolder = document.getElementById("recipePageImagePlaceholder");
  if (staleHolder) staleHolder.remove();
  recipePageImage.style.display = "";

  recipeStats.innerHTML = "";

  if (!recipe) {
    recipePageTitle.textContent = "Recipe not found";
    recipePageImage.style.display = "none";
    recipePageIngredients.innerHTML = "";
    recipePageInstructions.innerHTML = "";
    return;
  }

  recipePageTitle.textContent = recipe.title;

  // Stat boxes
  const statDefs = [
    recipe.servings  && { label: "Servings",   value: recipe.servings },
    recipe.prepTime  && { label: "Prep time",  value: recipe.prepTime },
    recipe.cookTime  && { label: "Cook time",  value: recipe.cookTime },
    recipe.ingredientCount && { label: "Ingredients", value: recipe.ingredientCount },
  ].filter(Boolean);
  for (const { label, value } of statDefs) {
    const div = document.createElement("div");
    div.className = "recipe-stat";
    div.innerHTML = `<span class="stat-value">${escapeHtml(String(value))}</span><span class="stat-label">${escapeHtml(label)}</span>`;
    recipeStats.appendChild(div);
  }
  if (!statDefs.length) recipeStats.style.display = "none";

  const fullUrl = `${window.location.origin}${recipePath(recipe.id)}`;
  recipePageUrl.href = fullUrl;
  recipePageUrl.textContent = fullUrl;
  const mealimeUrl = `${window.location.origin}${mealimePath(recipe.id)}`;
  mealimeImportUrl.href = mealimeUrl;
  mealimeImportUrl.textContent = mealimeUrl;
  if (recipe.image) {
    recipePageImage.src = recipe.image;
    recipePageImage.alt = recipe.title;
    recipePageImage.style.display = "block";
  } else {
    recipePageImage.style.display = "none";
    const ph = makePlaceholder(recipe.title, "recipe-page-image-placeholder");
    ph.id = "recipePageImagePlaceholder";
    recipePageImage.insertAdjacentElement("afterend", ph);
  }

  recipePageIngredients.innerHTML = "";
  for (const ingredient of recipe.ingredients || []) {
    const li = document.createElement("li");
    li.textContent = ingredient;
    recipePageIngredients.appendChild(li);
  }

  recipePageInstructions.innerHTML = "";
  const steps = recipe.instructions || [];
  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "Instructions were not found in this recipe yet.";
    recipePageInstructions.appendChild(li);
  } else {
    for (const step of steps) {
      const li = document.createElement("li");
      li.textContent = step;
      recipePageInstructions.appendChild(li);
    }
  }
  setEditMode(false);
}

function renderRoute() {
  const routeId = getRouteRecipeId();
  if (routeId) {
    const recipe = recipeById.get(routeId) || null;
    homeView.classList.add("hidden");
    recipePage.classList.remove("hidden");
    renderRecipePage(recipe);
  } else {
    recipePage.classList.add("hidden");
    homeView.classList.remove("hidden");
    renderHome();
    updateSelectionUi();
  }
}

function sectionHtml(title, items) {
  if (!items || !items.length) return "";
  const rows = items.map((item) => `<li><input type="checkbox" /> <span>${escapeHtml(item)}</span></li>`).join("");
  return `<section class="category"><h3>${escapeHtml(title)}</h3><ul class="items">${rows}</ul></section>`;
}

function renderShoppingList(payload) {
  const categories = ["Produce", "Meat and Seafood", "Dairy and Eggs", "Pantry and Spices", "Other"];
  const sections = [];
  for (const category of categories) sections.push(sectionHtml(category, payload.consolidated[category]));
  for (const category of categories) sections.push(sectionHtml(`${category} (As Needed)`, payload.asNeeded[category]));
  const selected = payload.selected.map((title) => `<span class="chip">${escapeHtml(title)}</span>`).join("");
  shoppingOutput.innerHTML = `<div class="recipe-chips">${selected}</div>${sections.filter(Boolean).join("") || '<p class="muted">No ingredients found.</p>'}`;
  latestShoppingMarkdown = payload.markdown || "";
  savedFile.textContent = payload.savedFile ? `Saved to ${payload.savedFile}` : "List ready to download.";
  updateSelectionUi();
}

async function loadRecipes() {
  const response = await fetch("/api/recipes");
  if (!response.ok) throw new Error("Failed to load recipes.");
  const payload = await response.json();
  recipes = payload.recipes || [];
  recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
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
  } catch (_err) {
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
    if (!response.ok) throw new Error(payload.error || "Failed to generate shopping list.");
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

backToPlanner.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("/");
});

window.addEventListener("popstate", renderRoute);

editRecipeBtn.addEventListener("click", () => {
  const recipe = recipeById.get(activeRecipeId);
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
    ingredients: editIngredients.value.split("\n").map((v) => v.trim()).filter(Boolean),
    instructions: editInstructions.value.split("\n").map((v) => v.trim()).filter(Boolean),
  };
  try {
    await saveRecipeEdits(activeRecipeId, patch);
    await loadRecipes();
    renderRoute();
  } catch (error) {
    stateHint.textContent = error.message;
  } finally {
    saveEditRecipeBtn.disabled = false;
    saveEditRecipeBtn.textContent = "Save Changes";
    setEditMode(false);
  }
});

Promise.all([loadRecipes(), loadRecipeStates()])
  .then(() => {
    renderRoute();
    updateSelectionUi();
  })
  .catch((error) => {
    weeksWrap.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  });
