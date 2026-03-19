const fs = require("fs");
const path = require("path");

const UNIT_ALIASES = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  cup: "cup",
  cups: "cup",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  clove: "clove",
  cloves: "clove",
  bag: "bag",
  bags: "bag",
  can: "can",
  cans: "can",
};

const CATEGORIES = {
  Produce: [
    "spinach",
    "tomato",
    "lemon",
    "cucumber",
    "onion",
    "garlic",
    "parsley",
    "dill",
    "pepper",
    "zucchini",
    "broccoli",
    "cauliflower",
  ],
  "Meat and Seafood": ["beef", "chicken", "turkey", "pork", "shrimp", "salmon", "fish", "lamb", "duck"],
  "Dairy and Eggs": ["feta", "yogurt", "cheese", "milk", "cream", "butter", "egg"],
  "Pantry and Spices": [
    "olive oil",
    "oil",
    "salt",
    "paprika",
    "oregano",
    "cumin",
    "rice",
    "flour",
    "vinegar",
    "olives",
  ],
};

const CATEGORIES_ORDER = ["Produce", "Meat and Seafood", "Dairy and Eggs", "Pantry and Spices", "Other"];

function recipesDir() {
  const fromCwd = path.resolve(process.cwd(), "recipes", "claude");
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(__dirname, "..", "..", "..", "recipes", "claude");
}

function parseFrontmatter(lines) {
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return {};
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) {
    return {};
  }
  const data = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) data[key] = value;
  }
  return data;
}

function extractIngredients(lines) {
  const ingredients = [];
  let inIngredients = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("## ingredients")) {
      inIngredients = true;
      continue;
    }
    if (inIngredients && trimmed.startsWith("## ")) {
      break;
    }
    if (!inIngredients) continue;
    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim();
      if (item) ingredients.push(item);
    }
  }
  return ingredients;
}

function sanitizeImageValue(image) {
  if (!image) return null;
  const value = image.trim();
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  return null;
}

function loadRecipes() {
  const dir = recipesDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .sort();

  return files.map((name) => {
    const abs = path.join(dir, name);
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    const fm = parseFrontmatter(lines);
    let title = fm.title || "";
    if (!title) {
      title = name.replace(/\.md$/i, "");
      for (const line of lines) {
        if (line.startsWith("# ")) {
          title = line.slice(2).trim();
          break;
        }
      }
    }
    const id = name.replace(/\.md$/i, "");
    const ingredients = extractIngredients(lines);
    return {
      id,
      title,
      servings: fm.servings || null,
      image: sanitizeImageValue(fm.image || null),
      ingredients,
    };
  });
}

function normalizeName(text) {
  return text.toLowerCase().replace("to taste", "").replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");
}

function parseNumber(text) {
  const value = text.trim();
  if (/^\d+\s+\d+\/\d+$/.test(value)) {
    const [whole, frac] = value.split(/\s+/);
    const [n, d] = frac.split("/").map(Number);
    if (!d) return null;
    return Number(whole) + n / d;
  }
  if (/^\d+\/\d+$/.test(value)) {
    const [n, d] = value.split("/").map(Number);
    if (!d) return null;
    return n / d;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  return null;
}

function parseIngredient(line) {
  const match = line.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+([A-Za-z]+)?\s+(.+?)\s*$/);
  if (!match) {
    return { raw: line, name: line.trim(), quantity: null, unit: null };
  }
  const quantity = parseNumber(match[1]);
  if (quantity === null) {
    return { raw: line, name: line.trim(), quantity: null, unit: null };
  }
  const unitRaw = match[2] || null;
  const unit = unitRaw ? UNIT_ALIASES[unitRaw.toLowerCase()] || unitRaw.toLowerCase() : null;
  return { raw: line, name: match[3].trim(), quantity, unit };
}

function formatQuantity(value) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return String(rounded);
}

function categorize(name) {
  const low = name.toLowerCase();
  for (const [category, words] of Object.entries(CATEGORIES)) {
    if (words.some((word) => low.includes(word))) {
      return category;
    }
  }
  return "Other";
}

function buildShoppingList(selectedRecipes) {
  const aggregated = {};
  const displayNames = {};
  const asNeeded = {};

  for (const recipe of selectedRecipes) {
    for (const line of recipe.ingredients) {
      const parsed = parseIngredient(line);
      const normName = normalizeName(parsed.name);
      if (parsed.quantity !== null) {
        const key = `${normName}||${parsed.unit || ""}`;
        aggregated[key] = (aggregated[key] || 0) + parsed.quantity;
        displayNames[key] = parsed.name;
      } else {
        if (!asNeeded[normName]) {
          asNeeded[normName] = parsed.name;
        }
      }
    }
  }

  const consolidated = {};
  for (const key of Object.keys(aggregated).sort()) {
    const [normName, unit] = key.split("||");
    const name = displayNames[key] || normName;
    const unitPart = unit ? ` ${unit}` : "";
    const line = `${formatQuantity(aggregated[key])}${unitPart} ${name}`;
    const category = categorize(name);
    if (!consolidated[category]) consolidated[category] = [];
    consolidated[category].push(line);
  }

  const needed = {};
  for (const normName of Object.keys(asNeeded).sort()) {
    const name = asNeeded[normName];
    const category = categorize(name);
    if (!needed[category]) needed[category] = [];
    needed[category].push(name);
  }

  for (const category of CATEGORIES_ORDER) {
    if (!consolidated[category]) consolidated[category] = [];
    if (!needed[category]) needed[category] = [];
  }

  return { consolidated, asNeeded: needed };
}

function shoppingListMarkdown(selectedTitles, consolidated, asNeeded) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# Shopping List (${today})`, "", "## Selected Dinners", "");
  for (const title of selectedTitles) {
    lines.push(`- ${title}`);
  }
  lines.push("", "## Consolidated Ingredients", "");
  for (const category of CATEGORIES_ORDER) {
    const items = consolidated[category] || [];
    if (items.length === 0) continue;
    lines.push(`### ${category}`, "");
    for (const item of items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }
  lines.push("## Add As Needed", "");
  for (const category of CATEGORIES_ORDER) {
    const items = asNeeded[category] || [];
    if (items.length === 0) continue;
    lines.push(`### ${category}`, "");
    for (const item of items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

module.exports = {
  CATEGORIES_ORDER,
  buildShoppingList,
  loadRecipes,
  shoppingListMarkdown,
};
