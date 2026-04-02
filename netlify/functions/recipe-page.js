const fs = require('fs');
const path = require('path');

function rawHtmlDir() {
  const fromCwd = path.resolve(process.cwd(), 'recipes', 'raw-html');
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(__dirname, '..', '..', 'recipes', 'raw-html');
}

function sanitizeSlug(raw) {
  return (raw || '').replace(/[^a-z0-9-]/gi, '');
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

  const mealimeLink = `<div style="max-width:860px;margin:0 auto;padding:0 20px 32px"><div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(0,0,0,.08);text-align:right"><a href="/mealime/${slug}" style="color:#C4622D;font-size:13px;text-decoration:none;font-family:\'DM Sans\',sans-serif;letter-spacing:.3px">View Mealime Import Page \u2192</a></div></div>`;

  html = html.replace('</body>', mealimeLink + '\n</body>');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  };
};
