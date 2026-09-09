// Packs the build into one self-contained page for the hosted artifact:
// every stylesheet, script, font and image inlined. Output has no
// doctype/html/head/body of its own (the host adds the skeleton).
import fs from 'node:fs';
import path from 'node:path';
const read = (p) => fs.readFileSync(p);
const mime = { '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const dataUri = (p) => `data:${mime[path.extname(p)]};base64,${read(p).toString('base64')}`;

let html = fs.readFileSync('index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const desc = head.match(/<meta name="description"[^>]*>/)[0];
const styleInline = head.slice(head.indexOf('<style>') + 7, head.indexOf('</style>'));
let fontsCss = fs.readFileSync('assets/fonts/fonts.css', 'utf8').replace(/url\('([^']+)'\)/g, (m, f) => `url('${dataUri('assets/fonts/' + f)}')`);
const engineCss = fs.readFileSync('scrollcraft.css', 'utf8');

body = body.replace(/(src|srcset)="(assets\/[^"]+)"/g, (m, attr, p) => `${attr}="${dataUri(p)}"`);
for (const f of ["vendor-three.min.js", "scrollcraft.js", "playbook.js", "page.js", "lead.js"]) {
  const js = fs.readFileSync(f, 'utf8');
  body = body.replace(`<script src="${f}"></script>`, () => '<script>' + js + '</script>');
}

const out = `${title}\n${desc}\n<style>${fontsCss}</style>\n<style>${engineCss}</style>\n<style>${styleInline}</style>\n${body}`;
fs.writeFileSync('artifact.html', out);
console.log('artifact.html', (out.length / 1024 / 1024).toFixed(2), 'MB');
