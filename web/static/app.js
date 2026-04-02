const WEEKS = {
  1: { bg: '#1F4E79', label: 'Week 1 \u2014 Mediterranean & American' },
  2: { bg: '#375623', label: 'Week 2 \u2014 Korean & Bold' },
  3: { bg: '#843C0C', label: 'Week 3 \u2014 Comfort & Global' },
  4: { bg: '#4A235A', label: 'Week 4 \u2014 Global Tour' },
  5: { bg: '#7B241C', label: 'Week 5 \u2014 Smoky & Rich' },
  6: { bg: '#0D6E54', label: 'Week 6 \u2014 Finish Strong' },
};

let recipes = [];
let states = {};

function recipeUrl(id) {
  return '/recipes/' + id;
}

function renderStars(recipeId) {
  const rating = (states[recipeId] || {}).rating || 0;
  const wrap = document.createElement('span');
  wrap.className = 'stars';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'star' + (i <= rating ? ' lit' : '');
    btn.textContent = '\u2605';
    btn.title = 'Rate ' + i + ' star' + (i > 1 ? 's' : '');
    const val = i;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      saveRating(recipeId, val, wrap);
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function updateStars(wrap, rating) {
  const btns = wrap.querySelectorAll('.star');
  btns.forEach(function(btn, idx) {
    btn.classList.toggle('lit', idx < rating);
  });
}

function saveRating(recipeId, rating, starsEl) {
  const prev = (states[recipeId] || {}).rating || 0;
  updateStars(starsEl, rating);
  fetch('/api/recipe-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId: recipeId, rating: rating }),
  }).then(function(res) {
    return res.json().then(function(data) {
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      states[recipeId] = Object.assign({}, states[recipeId] || {}, data.state);
      updateStars(starsEl, (data.state || {}).rating || 0);
    });
  }).catch(function() {
    updateStars(starsEl, prev);
  });
}

function makeRow(recipe) {
  var a = document.createElement('a');
  a.className = 'meal-row';
  a.href = recipeUrl(recipe.id);
  var name = document.createElement('span');
  name.className = 'mname';
  name.textContent = recipe.title;
  a.appendChild(name);
  a.appendChild(renderStars(recipe.id));
  return a;
}

function renderMealPlan() {
  var el = document.getElementById('viewMealplan');
  el.innerHTML = '';
  var weekMap = {};
  recipes.forEach(function(r) {
    var w = r.week || 0;
    if (!weekMap[w]) weekMap[w] = [];
    weekMap[w].push(r);
  });
  var weeks = Object.keys(weekMap).map(Number).sort(function(a, b) { return a - b; });
  weeks.forEach(function(w) {
    var info = WEEKS[w] || { bg: '#1C2B3A', label: 'Week ' + w };
    var card = document.createElement('div');
    card.className = 'week-card';
    var header = document.createElement('div');
    header.className = 'week-header';
    header.style.background = info.bg;
    header.textContent = info.label;
    var list = document.createElement('div');
    list.className = 'meal-list';
    weekMap[w].forEach(function(r) { list.appendChild(makeRow(r)); });
    card.appendChild(header);
    card.appendChild(list);
    el.appendChild(card);
  });
}

function renderBrowse() {
  var el = document.getElementById('viewBrowse');
  el.innerHTML = '';
  var header = document.createElement('div');
  header.className = 'browse-header';
  header.textContent = 'All Recipes';
  var list = document.createElement('div');
  list.className = 'meal-list';
  var sorted = recipes.slice().sort(function(a, b) { return a.title.localeCompare(b.title); });
  sorted.forEach(function(r) { list.appendChild(makeRow(r)); });
  el.appendChild(header);
  el.appendChild(list);
}

function showView(name) {
  document.getElementById('viewMealplan').hidden = name !== 'mealplan';
  document.getElementById('viewBrowse').hidden = name !== 'browse';
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.view === name);
  });
}

document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() { showView(tab.dataset.view); });
});

function init() {
  Promise.all([
    fetch('/api/recipes').then(function(r) { return r.json(); }),
    fetch('/api/recipe-states').then(function(r) { return r.ok ? r.json() : { states: {} }; }).catch(function() { return { states: {} }; }),
  ]).then(function(results) {
    recipes = results[0].recipes || [];
    states = results[1].states || {};
    var msg = document.getElementById('loadingMsg');
    if (msg) msg.remove();
    renderMealPlan();
    renderBrowse();
    showView('mealplan');
  }).catch(function(err) {
    var msg = document.getElementById('loadingMsg');
    if (msg) msg.textContent = 'Failed to load recipes.';
    console.error(err);
  });
}

init();
