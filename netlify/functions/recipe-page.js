const fs = require('fs');
const path = require('path');
const { fetchRecipeOverrides } = require('./_lib/supabase');

function rawHtmlDir() {
  const fromCwd = path.resolve(process.cwd(), 'recipes', 'raw-html');
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(__dirname, '..', '..', 'recipes', 'raw-html');
}

function sanitizeSlug(raw) {
  return (raw || '').replace(/[^a-z0-9-]/gi, '');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescHtml(str) {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function applyOverrides(html, override) {
  if (override.title) {
    html = html.replace(/<title>[^<]*<\/title>/, '<title>' + escHtml(override.title) + '</title>');
    html = html.replace(/(<h1[^>]*>)[^<]*(<\/h1>)/, '$1' + escHtml(override.title) + '$2');
  }
  if (override.description) {
    html = html.replace(/(<p class="desc">)[\s\S]*?(<\/p>)/, '$1' + escHtml(override.description) + '$2');
  }
  if (override.image) {
    html = html.replace(
      /(<div class="hero">\s*<img[^>]* src=")[^"]*(")/,
      '$1' + override.image.replace(/"/g, '&quot;') + '$2'
    );
  }
  return html;
}

function editPanel(slug, current) {
  return `<style>
#edit-fab{position:fixed;bottom:24px;right:24px;width:44px;height:44px;border-radius:50%;background:#1C2B3A;color:#fff;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:999;opacity:.65;transition:opacity .2s}
#edit-fab:hover{opacity:1}
#edit-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center}
#edit-modal.open{display:flex}
#edit-box{background:#fff;border-radius:6px;padding:28px 32px;width:100%;max-width:500px;margin:16px;box-shadow:0 8px 32px rgba(0,0,0,.2)}
#edit-box h2{font-family:'Playfair Display',serif;font-size:20px;color:#1C2B3A;margin-bottom:20px}
.ef-label{font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#6B5E4E;margin-bottom:6px;display:block}
.ef-input,.ef-textarea{width:100%;border:1px solid #d8cfc3;border-radius:4px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:14px;color:#2C2416;margin-bottom:16px;outline:none;box-sizing:border-box}
.ef-input:focus,.ef-textarea:focus{border-color:#C4622D}
.ef-textarea{resize:vertical;min-height:80px;line-height:1.5}
.ef-row{display:flex;gap:10px;justify-content:flex-end;margin-top:4px;align-items:center}
.ef-btn{padding:9px 20px;border-radius:4px;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500}
.ef-cancel{background:none;border:1px solid #d8cfc3;color:#6B5E4E}
.ef-save{background:#C4622D;color:#fff}
#edit-status{font-size:12px;color:#C4622D;margin-right:auto}
</style>
<button id="edit-fab" title="Edit recipe">&#9998;</button>
<div id="edit-modal">
  <div id="edit-box">
    <h2>Edit Recipe</h2>
    <label class="ef-label">Title</label>
    <input class="ef-input" id="ef-title" type="text" value="${escHtml(current.title)}">
    <label class="ef-label">Description</label>
    <textarea class="ef-textarea" id="ef-desc">${escHtml(current.description)}</textarea>
    <label class="ef-label">Hero Image URL</label>
    <input class="ef-input" id="ef-image" type="url" value="${escHtml(current.image)}">
    <div class="ef-row">
      <span id="edit-status"></span>
      <button class="ef-btn ef-cancel" id="ef-cancel">Cancel</button>
      <button class="ef-btn ef-save" id="ef-save">Save</button>
    </div>
  </div>
</div>
<script>
(function(){
  var fab = document.getElementById('edit-fab');
  var modal = document.getElementById('edit-modal');
  var status = document.getElementById('edit-status');
  fab.addEventListener('click', function(){ modal.classList.add('open'); });
  document.getElementById('ef-cancel').addEventListener('click', function(){ modal.classList.remove('open'); status.textContent=''; });
  modal.addEventListener('click', function(e){ if(e.target===modal){ modal.classList.remove('open'); status.textContent=''; }});
  document.getElementById('ef-save').addEventListener('click', function(){
    var btn = this;
    var title = document.getElementById('ef-title').value.trim();
    var desc = document.getElementById('ef-desc').value.trim();
    var image = document.getElementById('ef-image').value.trim();
    if(!title){ status.textContent='Title is required.'; return; }
    btn.disabled = true;
    status.textContent = 'Saving\u2026';
    fetch('/api/recipe-edit', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({recipeId: '${slug}', title: title, description: desc || null, image: image || null})
    }).then(function(r){ return r.json(); }).then(function(data){
      if(data.error){ status.textContent = data.error; btn.disabled=false; return; }
      status.textContent = 'Saved!';
      setTimeout(function(){ location.reload(); }, 600);
    }).catch(function(){
      status.textContent = 'Error saving.';
      btn.disabled = false;
    });
  });
})();
</script>`;
}

exports.handler = async function(event) {
  const pathStr = event.path || '';
  const raw = pathStr.replace(/^\/recipes\//, '').replace(/\.html$/i, '').replace(/\/$/, '');
  const slug = sanitizeSlug(raw);

  if (!slug) {
    return { statusCode: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<h1>Not found</h1>' };
  }

  const dir = rawHtmlDir();
  const file = path.join(dir, slug + '.html');

  if (!fs.existsSync(file)) {
    return { statusCode: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<h1>Recipe not found</h1>' };
  }

  let html = fs.readFileSync(file, 'utf8');

  // Fetch and apply any saved overrides
  let override = {};
  try {
    const overrides = await fetchRecipeOverrides([slug]);
    override = overrides[slug] || {};
  } catch (_) {}
  html = applyOverrides(html, override);

  // Extract current values for the edit panel (unescape HTML entities)
  const titleMatch = html.match(/<h1[^>]*>([^<]*)<\/h1>/);
  const descMatch = html.match(/<p class="desc">([\s\S]*?)<\/p>/);
  const imgMatch = html.match(/<div class="hero">\s*<img[^>]* src="([^"]*)"/);
  const current = {
    title: unescHtml(titleMatch ? titleMatch[1] : slug),
    description: unescHtml(descMatch ? descMatch[1] : ''),
    image: unescHtml(imgMatch ? imgMatch[1] : ''),
  };

  const mealimeLink = `<div style="max-width:860px;margin:0 auto;padding:0 20px 32px"><div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(0,0,0,.08);text-align:right"><a href="/mealime/${slug}" style="color:#C4622D;font-size:13px;text-decoration:none;font-family:'DM Sans',sans-serif;letter-spacing:.3px">View Mealime Import Page \u2192</a></div></div>`;

  html = html.replace('</body>', mealimeLink + '\n' + editPanel(slug, current) + '\n</body>');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  };
};
