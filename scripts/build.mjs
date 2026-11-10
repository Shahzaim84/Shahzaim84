// Builds every SVG card used by README.md.
// Text is converted to outlines with the real Poppins and Instrument Serif fonts,
// so the look is identical on every device (GitHub blocks custom fonts in images).
//
//   node scripts/build.mjs            build from data/contributions.json (if present)
//   node scripts/build.mjs --fetch    pull live contribution data (needs GH_TOKEN), then build
//   node scripts/build.mjs --sample   preview with fake data into ./preview (never commit this)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const FETCH = args.includes('--fetch');
const SAMPLE = args.includes('--sample');
const OUT = path.resolve(ROOT, SAMPLE ? 'preview' : 'assets');
fs.mkdirSync(OUT, { recursive: true });

const USER = 'Shahzaim84';
const W = 830;

/* ------------------------------------------------------------------ palette */
const CREAM = '#F3EFE6';
const BORDER = '#E2DCCD';
const INK = '#16130F';
const MUTED = '#6F695E';
const LINE = '#DDD6C6';
const BLUE = '#2347F5';
const RED = '#E23B2E';
const YELLOW = '#F6C21C';
const HEAT = ['#E7E2D5', '#C9D3FF', '#8FA4FF', '#4A67FA', '#1B2FD6'];

/* -------------------------------------------------------------------- fonts */
function loadFont(pkg, file) {
  const p = path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file);
  const b = fs.readFileSync(p);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const F = {
  s4: loadFont('poppins', 'poppins-latin-400-normal.woff'),
  s5: loadFont('poppins', 'poppins-latin-500-normal.woff'),
  s6: loadFont('poppins', 'poppins-latin-600-normal.woff'),
  ser: loadFont('instrument-serif', 'instrument-serif-latin-400-normal.woff'),
  seri: loadFont('instrument-serif', 'instrument-serif-latin-400-italic.woff'),
};

/* ------------------------------------------------------------------ helpers */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

const rn = (v) => {
  if (!Number.isFinite(v)) throw new Error('bad coordinate in glyph path');
  return String(Math.round(v * 100) / 100);
};
function pathD(cmds) {
  return cmds.map((c) => {
    if (c.type === 'M' || c.type === 'L') return c.type + rn(c.x) + ' ' + rn(c.y);
    if (c.type === 'Q') return 'Q' + rn(c.x1) + ' ' + rn(c.y1) + ' ' + rn(c.x) + ' ' + rn(c.y);
    if (c.type === 'C') return 'C' + rn(c.x1) + ' ' + rn(c.y1) + ' ' + rn(c.x2) + ' ' + rn(c.y2) + ' ' + rn(c.x) + ' ' + rn(c.y);
    return 'Z';
  }).join('');
}
// Manual glyph layout (skips opentype.js GSUB shaping, which these fonts trip over)
function layout(f, s, size, ls = 0) {
  const scale = size / f.unitsPerEm;
  const glyphs = [];
  let x = 0, prev = null;
  for (const ch of s) {
    const g = f.charToGlyph(ch);
    if (g.index === 0 && ch !== ' ') console.warn('missing glyph:', JSON.stringify(ch), 'in', s);
    if (prev) { const k = f.getKerningValue(prev, g); if (Number.isFinite(k)) x += k * scale; }
    glyphs.push({ g, x });
    x += g.advanceWidth * scale + ls * size;
    prev = g;
  }
  return { glyphs, width: x - (s.length ? ls * size : 0) };
}
function tw(f, s, size, ls = 0) {
  return layout(f, s, size, ls).width;
}
function txt(f, s, x, y, size, fill, { anchor = 'start', ls = 0, op = 1 } = {}) {
  const { glyphs, width } = layout(f, s, size, ls);
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const d = glyphs.map(({ g, x: gx }) => pathD(g.getPath(x0 + gx, y, size).commands)).join('');
  return `<path d="${d}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
}
// several styled pieces on one baseline: parts = [{f, s, fill}]
function runs(parts, x, y, size, { anchor = 'start' } = {}) {
  const total = parts.reduce((a, p) => a + tw(p.f, p.s, p.size || size), 0);
  let cx = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  let out = '';
  for (const p of parts) {
    const sz = p.size || size;
    out += txt(p.f, p.s, cx, y, sz, p.fill);
    cx += tw(p.f, p.s, sz);
  }
  return { svg: out, width: total };
}
function wrap(f, text, size, maxW, ls = 0) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (tw(f, t, size, ls) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function para(f, text, x, y, size, lh, maxW, fill, opts = {}) {
  const lines = wrap(f, text, size, maxW);
  return { svg: lines.map((l, i) => txt(f, l, x, y + i * lh, size, fill, opts)).join(''), lines: lines.length };
}
function fit(f, text, maxW, size, min = 14) {
  while (size > min && tw(f, text, size) > maxW) size -= 1;
  return size;
}
const label = (s, x, y, fill = MUTED, extra = {}) => txt(F.s5, s.toUpperCase(), x, y, 10.5, fill, { ls: 0.14, ...extra });
const svg = (w, h, title, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const card = (x, y, w, h, fill = CREAM, r = 24, stroke = BORDER) =>
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ''}/>`;
const arrow = (x, y, color, s = 7, sw = 1.8) =>
  `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M${x} ${y + s} L${x + s} ${y}"/><path d="M${x + 1} ${y} H${x + s} V${y + s - 1}"/></g>`;
const write = (name, content) => fs.writeFileSync(path.join(OUT, name), content);

/* --------------------------------------------------------------------- data */
function sampleData() {
  const weeks = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 52 * 7 - end.getDay());
  const d = new Date(start);
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      if (d <= end) {
        const c = rnd() < 0.22 ? 0 : Math.floor(rnd() * rnd() * 22);
        const level = c === 0 ? 'NONE' : c < 3 ? 'FIRST_QUARTILE' : c < 7 ? 'SECOND_QUARTILE' : c < 13 ? 'THIRD_QUARTILE' : 'FOURTH_QUARTILE';
        days.push({ date: d.toISOString().slice(0, 10), contributionCount: c, contributionLevel: level });
      }
      d.setDate(d.getDate() + 1);
    }
    weeks.push({ contributionDays: days });
  }
  return { totalContributions: weeks.flatMap((w) => w.contributionDays).reduce((a, x) => a + x.contributionCount, 0), weeks };
}

async function loadData() {
  if (SAMPLE) return sampleData();
  const file = path.join(ROOT, 'data', 'contributions.json');
  if (FETCH) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) throw new Error('Set GH_TOKEN to use --fetch');
    const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login: USER } }),
    });
    const json = await res.json();
    const cal = json?.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) throw new Error('GitHub API error: ' + JSON.stringify(json).slice(0, 300));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cal));
    return cal;
  }
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function computeStats(cal) {
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  const total = cal.totalContributions;
  const last365 = days.slice(-365);
  const active = last365.filter((d) => d.contributionCount > 0).length;
  const busiest = Math.max(...days.map((d) => d.contributionCount));
  let i = days.length - 1;
  if (days[i].contributionCount === 0) i--; // today may not have a commit yet
  let current = 0;
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  const byMonth = new Map();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) || 0) + d.contributionCount);
  }
  const months = [...byMonth.entries()].slice(-12);
  return { total, active, span: last365.length, busiest, current, longest, months };
}

/* --------------------------------------------------------------------- hero */
function hero() {
  const H = 330;
  let b = card(0, 0, W, H, CREAM, 28);
  // halftone field (stands in for a portrait, no photo needed)
  const clip = `<clipPath id="hc"><rect x="500" y="22" width="308" height="286" rx="18"/></clipPath>`;
  let dots = '';
  const s = 9.5;
  for (let j = 0; j < 31; j++) {
    for (let i = 0; i < 33; i++) {
      const px = 502 + i * s, py = 26 + j * s;
      const t = Math.min(1, Math.max(0, (px - 500) / 120));
      const fade = t * t * (3 - 2 * t);
      const f = 0.5 + 0.5 * Math.sin(i * 0.32 + Math.sin(j * 0.21) * 1.9) * Math.cos(j * 0.27 - i * 0.09);
      const vy = Math.sin(((py - 22) / 286) * Math.PI);
      const r = Math.max(0, f * fade * (0.45 + 0.55 * vy)) * 4.7;
      if (r > 0.55) dots += `<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(r)}"/>`;
    }
  }
  b += `<g clip-path="url(#hc)" fill="${BLUE}">${dots}</g>`;

  b += `<circle cx="52" cy="57" r="4.5" fill="${BLUE}"/>`;
  b += label('Full stack  /  AI developer', 66, 61);
  b += runs([{ f: F.ser, s: 'Shah', fill: INK }, { f: F.seri, s: 'zaim', fill: INK }], 46, 178, 112).svg;
  b += para(F.s4, 'I build AI products and automation systems, and ship them end to end, from the database to deployment.', 50, 222, 15.5, 24, 440, INK).svg;

  // meta row
  let x = 50;
  for (const [i, m] of ['Karachi, Pakistan', 'BSCS, NED University', 'Open to work'].entries()) {
    if (i > 0) { b += `<rect x="${r1(x)}" y="281" width="1" height="14" fill="${LINE}"/>`; x += 16; }
    b += txt(F.s5, m, x, 292, 12, i === 2 ? BLUE : MUTED);
    x += tw(F.s5, m, 12) + 16;
  }
  write('hero.svg', svg(W, H, 'Shahzaim. Full stack and AI developer from Karachi, Pakistan.', b, clip));
}

/* -------------------------------------------------------------------- bento */
function bento() {
  const H = 178, cw = 266, gap = 16;
  const items = [
    { bg: BLUE, fg: '#FFFFFF', tag: 'Build', big: '3 AI products', d: 'HireFlow AI, PharmifyAI and Corpus AI, built from database to deployment.' },
    { bg: RED, fg: '#FFFFFF', tag: 'Automate', big: 'Voice agents', d: 'VAPI voice agents and n8n workflows for clients across the USA, Finland and Australia.' },
    { bg: YELLOW, fg: INK, tag: 'Learn', big: 'BSCS at NED', d: 'Computer Science student in Karachi, shipping real products while studying.' },
  ];
  let b = '';
  items.forEach((it, i) => {
    const x = i * (cw + gap);
    b += `<rect x="${x}" y="0" width="${cw}" height="${H}" rx="22" fill="${it.bg}"/>`;
    b += label(it.tag, x + 24, 40, it.fg, { op: 0.85 });
    const size = fit(F.ser, it.big, cw - 48, 46);
    b += txt(F.ser, it.big, x + 24, 98, size, it.fg);
    b += para(F.s4, it.d, x + 24, 128, 12.5, 18, cw - 48, it.fg, { op: 0.92 }).svg;
  });
  write('bento.svg', svg(W, H, 'Build, automate, learn: three AI products, voice agents and n8n workflows, and a BSCS degree at NED University.', b));
}

/* ------------------------------------------------------------------ heatmap */
function contrib(cal) {
  const H = 272;
  let b = card(0, 0, W, H, CREAM, 24);
  b += runs([{ f: F.ser, s: 'Every day, ', fill: INK }, { f: F.seri, s: 'in blue', fill: BLUE }], 32, 70, 42).svg;
  b += label('Refreshed daily', W - 32, 54, MUTED, { anchor: 'end' });

  const gx = 32, gy = 128, p = 14.4, cs = 11.4;
  const weeks = cal ? cal.weeks : Array.from({ length: 53 }, () => ({ contributionDays: Array.from({ length: 7 }, () => ({ contributionLevel: 'NONE', date: '' })) }));
  const levelIdx = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  let lastMonth = -1, lastX = -99;
  weeks.forEach((w, wi) => {
    const first = w.contributionDays[0];
    if (cal && first?.date) {
      const m = Number(first.date.slice(5, 7));
      if (m !== lastMonth) {
        const x = gx + wi * p;
        if (x - lastX > 30) {
          b += txt(F.s4, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1], x, 116, 10, MUTED);
          lastX = x;
        }
        lastMonth = m;
      }
    }
    w.contributionDays.forEach((d, di) => {
      const c = HEAT[levelIdx[d.contributionLevel] || 0];
      b += `<rect x="${r1(gx + wi * p)}" y="${r1(gy + di * p)}" width="${cs}" height="${cs}" rx="2.6" fill="${c}"/>`;
    });
  });
  // legend
  const lx = W - 32 - (5 * 14.4 + 70);
  b += txt(F.s4, 'Less', lx, 250, 10, MUTED);
  HEAT.forEach((c, i) => (b += `<rect x="${r1(lx + 32 + i * 14.4)}" y="241" width="${cs}" height="${cs}" rx="2.6" fill="${c}"/>`));
  b += txt(F.s4, 'More', lx + 32 + 5 * 14.4 + 4, 250, 10, MUTED);
  write('contributions.svg', svg(W, H, 'GitHub contribution heatmap for the last year', b));
}

/* -------------------------------------------------------------------- stats */
function stats(cal) {
  const H = 240, lw = 548, rx0 = 564, rw = 266;
  const st = cal ? computeStats(cal) : null;
  const fmt = (n) => n.toLocaleString('en-US');
  let b = card(0, 0, lw, H, CREAM, 24) + card(rx0, 0, rw, H, CREAM, 24);

  b += label('The last 12 months on GitHub', 28, 46);
  b += runs([{ f: F.seri, s: st ? fmt(st.total) : '--', fill: INK, size: 58 }, { f: F.seri, s: ' contributions', fill: MUTED, size: 28 }], 28, 108, 58).svg;

  const months = st ? st.months : Array.from({ length: 12 }, (_, i) => ['', 0]);
  const max = st ? Math.max(1, ...months.map((m) => m[1])) : 1;
  const bw = 28, gap = (lw - 56 - 12 * bw) / 11, base = 198, maxH = 64;
  const peak = st ? months.findIndex((m) => m[1] === max) : -1;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach(([k, v], i) => {
    const h = st ? Math.max(4, (v / max) * maxH) : 6;
    const x = 28 + i * (bw + gap);
    const fill = !st ? LINE : i === peak ? BLUE : INK;
    b += `<rect x="${r1(x)}" y="${r1(base - h)}" width="${bw}" height="${r1(h)}" rx="3" fill="${fill}"/>`;
    if (st) b += txt(F.s4, names[Number(k.slice(5, 7)) - 1], x + bw / 2, 220, 10, MUTED, { anchor: 'middle' });
  });

  const rows = [
    { big: st ? String(st.current) : '--', unit: ' days', sub: st ? `current streak, longest ${st.longest}` : 'current streak' },
    { big: st ? String(st.active) : '--', unit: st ? ` / ${st.span}` : '', sub: 'days with a commit' },
    { big: st ? String(st.busiest) : '--', unit: '', sub: 'on the busiest day' },
  ];
  const rh = H / 3;
  rows.forEach((r, i) => {
    const top = i * rh;
    if (i > 0) b += `<rect x="${rx0 + 24}" y="${r1(top)}" width="${rw - 48}" height="1" fill="${LINE}"/>`;
    b += runs([{ f: F.ser, s: r.big, fill: INK, size: 44 }, { f: F.seri, s: r.unit, fill: MUTED, size: 22 }], rx0 + 26, top + 50, 44).svg;
    b += txt(F.s4, r.sub, rx0 + 26, top + 69, 11.5, MUTED);
  });
  write('stats.svg', svg(W, H, st ? `${st.total} contributions in the last 12 months` : 'GitHub contribution statistics', b));
}

/* ----------------------------------------------------------------- headings */
function headingBar(file, tag, a, bItal, title) {
  const H = 96;
  let b = card(0, 0, W, H, CREAM, 24);
  b += label(tag, 32, 34);
  b += runs([{ f: F.ser, s: a + ' ', fill: INK }, { f: F.seri, s: bItal, fill: BLUE }], 32, 82, 42).svg;
  write(file, svg(W, H, title, b));
}

/* ----------------------------------------------------------------- projects */
function project(file, p) {
  const cw = 270, H = 304;
  let b = card(0, 0, cw, H, CREAM, 24);
  const chipLabel = p.status.toUpperCase();
  const chipW = tw(F.s5, chipLabel, 10, 0.14) + 36;
  b += `<rect x="22" y="22" width="${r1(chipW)}" height="26" rx="13" fill="#EAE5D8"/>`;
  b += `<circle cx="36" cy="35" r="4" fill="${p.dot}"/>`;
  b += txt(F.s5, chipLabel, 47, 39, 10, INK, { ls: 0.14 });
  b += runs([{ f: F.ser, s: p.a, fill: INK }, { f: F.seri, s: p.b, fill: INK }], 24, 106, 40).svg;
  b += para(F.s4, p.desc, 24, 138, 12.5, 18.5, cw - 48, INK, { op: 0.88 }).svg;
  b += `<rect x="24" y="222" width="${cw - 48}" height="1" fill="${LINE}"/>`;
  b += para(F.s5, p.tech, 24, 246, 10.5, 15, cw - 48, MUTED).svg;
  b += txt(F.s6, p.link, 24, 282, 12, BLUE);
  b += arrow(24 + tw(F.s6, p.link, 12) + 8, 272, BLUE);
  write(file, svg(cw, H, `${p.a}${p.b}. ${p.desc}`, b));
}

/* -------------------------------------------------------------------- stack */
function stack() {
  const rows = [
    ['Frontend', ['React.js', 'Next.js', 'TypeScript', 'JavaScript', 'Tailwind CSS', 'ShadCN UI', 'Framer Motion']],
    ['Backend', ['Node.js', 'Express.js', 'REST APIs', 'WebSocket', 'JWT Auth', 'BullMQ']],
    ['Databases', ['MongoDB', 'PostgreSQL', 'Neon', 'Redis']],
    ['AI and automation', ['LangChain', 'LangGraph', 'RAG', 'Pinecone', 'n8n', 'VAPI', 'Cartesia AI', 'Whisper', 'OpenAI', 'Gemini']],
    ['Python and data', ['Python', 'Pandas', 'NumPy', 'Scikit-learn', 'Matplotlib']],
    ['DevOps and tools', ['Docker', 'CI/CD', 'GitHub Actions', 'Git', 'Postman', 'Stripe', 'Cloudinary']],
  ];
  const colX = 250, maxW = W - 32 - colX, sep = '   /   ', size = 14;
  let y = 120, b = '';
  const lays = rows.map(([name, items]) => {
    const lines = [];
    let cur = [];
    const widthOf = (arr) => tw(F.s4, arr.join(sep), size);
    for (const it of items) {
      if (cur.length && widthOf([...cur, it]) > maxW) { lines.push(cur); cur = []; }
      cur.push(it);
    }
    lines.push(cur);
    return { name, lines };
  });
  const H = 120 + lays.reduce((a, r) => a + 28 + r.lines.length * 21 + 14, 0) - 4;
  b += card(0, 0, W, H, CREAM, 24);
  b += label('Tools I use', 32, 34);
  b += runs([{ f: F.ser, s: 'My ', fill: INK }, { f: F.seri, s: 'stack', fill: BLUE }], 32, 82, 42).svg;
  lays.forEach((r, i) => {
    b += `<rect x="32" y="${y - 6}" width="${W - 64}" height="1" fill="${LINE}"/>`;
    b += label(r.name, 32, y + 22);
    r.lines.forEach((ln, li) => {
      const parts = [];
      ln.forEach((it, k) => {
        if (k > 0) parts.push({ f: F.s4, s: sep, fill: '#B9B2A2' });
        parts.push({ f: F.s4, s: it, fill: INK });
      });
      b += runs(parts, colX, y + 23 + li * 21, size).svg;
    });
    y += 28 + r.lines.length * 21 + 14;
  });
  write('stack.svg', svg(W, H, 'Tech stack: frontend, backend, databases, AI and automation, Python and data, DevOps and tools.', b));
}

/* --------------------------------------------------------------- work with me */
function services() {
  const items = [
    ['01', 'Voice agents', 'Inbound and outbound call agents built on VAPI, with speech to text and natural voices.'],
    ['02', 'RAG chatbots', 'Chatbots grounded in your own documents, with hybrid search and an embeddable API.'],
    ['03', 'n8n automation', 'Workflows that connect email, documents and business tools, with AI steps where they help.'],
    ['04', 'Full-stack web apps', 'Next.js and Node.js products with auth, payments and dashboards, shipped end to end.'],
  ];
  const H = 364, colW = 366;
  let b = card(0, 0, W, H, CREAM, 24);
  b += label('Services', 32, 34);
  b += runs([{ f: F.ser, s: 'Work ', fill: INK }, { f: F.seri, s: 'with me', fill: BLUE }], 32, 82, 42).svg;
  items.forEach(([n, t, d], i) => {
    const x = 32 + (i % 2) * (colW + 34);
    const y = 118 + Math.floor(i / 2) * 120;
    b += `<rect x="${x}" y="${y - 8}" width="${colW}" height="1" fill="${LINE}"/>`;
    b += txt(F.s6, n, x, y + 22, 11, BLUE, { ls: 0.1 });
    b += txt(F.ser, t, x + 36, y + 30, 30, INK);
    b += para(F.s4, d, x + 36, y + 58, 12.5, 18.5, colW - 40, MUTED).svg;
  });
  write('services.svg', svg(W, H, 'Services: voice agents, RAG chatbots, n8n automation and full-stack web apps.', b));
}

/* ------------------------------------------------------------------- footer */
function footer() {
  const H = 160;
  let b = card(0, 0, W, H, CREAM, 24);
  b += label('Get in touch', 32, 44);
  b += runs([{ f: F.ser, s: 'Let’s build something ', fill: INK }, { f: F.seri, s: 'intelligent', fill: BLUE }, { f: F.ser, s: '.', fill: INK }], 32, 100, 50).svg;
  b += txt(F.s4, 'Open to full-stack and AI roles, and freelance projects.', 32, 134, 13.5, MUTED);
  write('footer.svg', svg(W, H, 'Let’s build something intelligent. Open to full-stack and AI roles, and freelance projects.', b));
}

function pill(file, word) {
  const w = 260, h = 64;
  let b = card(0, 0, w, h, CREAM, 32);
  b += txt(F.seri, word, 30, 41, 28, INK);
  b += arrow(w - 44, 24, BLUE, 12, 2.2);
  write(file, svg(w, h, word, b));
}

/* --------------------------------------------------------------------- main */
const cal = await loadData();
hero();
bento();
contrib(cal);
stats(cal);
headingBar('heading-projects.svg', 'Selected work', 'What I’m', 'building', 'What I’m building');
project('project-hireflow.svg', { status: 'In development', dot: YELLOW, a: 'HireFlow ', b: 'AI', desc: 'AI recruitment and interview automation platform with an admin dashboard and role-based access.', tech: 'Next.js, Express.js, MongoDB, Redis, BullMQ, OpenAI, Whisper', link: 'See my projects' });
project('project-pharmify.svg', { status: 'Live', dot: BLUE, a: 'Pharmify', b: 'AI', desc: 'AI pharmacy education platform where students practice clinical cases with a virtual mentor and a voice agent.', tech: 'Next.js, Express.js, MongoDB, OpenAI, VAPI, Cartesia AI, Stripe', link: 'pharmify-ai.vercel.app' });
project('project-corpus.svg', { status: 'Live', dot: BLUE, a: 'Corpus ', b: 'AI', desc: 'No-code RAG platform. Upload documents, create chatbots and embed them anywhere through a REST API.', tech: 'Next.js, LangChain.js, Pinecone, MongoDB, OpenAI, Gemini, Stripe', link: 'corpusai.vercel.app' });
stack();
services();
footer();
pill('link-portfolio.svg', 'Portfolio');
pill('link-linkedin.svg', 'LinkedIn');
pill('link-github.svg', 'GitHub');
console.log(`built ${fs.readdirSync(OUT).length} files in ${path.relative(ROOT, OUT)}${cal ? '' : ' (no contribution data yet, empty state)'}`);
