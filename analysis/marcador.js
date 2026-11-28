/**
 * Herramienta para marcar líneas de fuga sobre la pintura y exportarlas a JSON.
 * Las coordenadas se guardan en píxeles de la imagen ORIGINAL (2996 x 4226),
 * aunque aquí se muestre la versión reducida de 2048 px.
 *
 * Mientras se marca, calcula en vivo el punto de fuga por mínimos cuadrados
 * (misma matemática que analysis/geometry.py, en versión compacta).
 */
import linesUrl from './data/lines.json?url';
import { createPolygonEditor } from './polygonEditor.js';

const ORIGINAL = { width: 2996, height: 4226 };
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const wrap = document.getElementById('wrap');
const kindSel = document.getElementById('kind');
const stats = document.getElementById('stats');
const jsonBox = document.getElementById('json');
const modeSel = document.getElementById('mode');
const zoneSel = document.getElementById('zone');
const zoneOnly = document.getElementById('zone-only');
const elementSel = document.getElementById('element');
const BASE = import.meta.env.DEV ? '/' : '../';

const img = new Image();
// En el build (base './') esta página vive en /analysis/, así que la imagen está un nivel arriba.
img.src = BASE + 'painting/crivelli_ng739_2048.jpg';

let data = { image: { file: 'analysis/source/crivelli_ng739.jpg', ...ORIGINAL }, orthogonals: [], diagonals: [] };
let pending = null; // primer extremo de la línea en curso
let view = { scale: 0.2, x: 20, y: 20 };
let drag = null;

// ---------------------------------------------------------------- matemática

/** Recta homogénea por dos puntos (producto cruz), normalizada. */
function lineOf([x1, y1, x2, y2]) {
  const a = y1 - y2, b = x2 - x1, c = x1 * y2 - x2 * y1;
  const n = Math.hypot(a, b);
  return [a / n, b / n, c / n];
}

/** Punto de fuga por mínimos cuadrados: autovector menor de A^T A (3x3), por iteración inversa. */
function vanishingPoint(segs) {
  if (segs.length < 2) return null;
  // Normalización de Hartley para estabilidad numérica
  const s = 1 / 2000, ox = ORIGINAL.width / 2, oy = ORIGINAL.height / 2;
  const L = segs.map(([x1, y1, x2, y2]) => lineOf([(x1 - ox) * s, (y1 - oy) * s, (x2 - ox) * s, (y2 - oy) * s]));
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const l of L) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += l[i] * l[j];
  // Iteración inversa: v <- (M + eps I)^-1 v converge al autovector de menor autovalor
  for (let i = 0; i < 3; i++) M[i][i] += 1e-9;
  const inv = invert3(M);
  let v = [0.3, 0.2, 1];
  for (let k = 0; k < 60; k++) {
    v = [0, 1, 2].map((i) => inv[i][0] * v[0] + inv[i][1] * v[1] + inv[i][2] * v[2]);
    const n = Math.hypot(...v);
    v = v.map((x) => x / n);
  }
  const p = [v[0] / v[2] / s + ox, v[1] / v[2] / s + oy];
  const res = segs.map((seg) => {
    const l = lineOf(seg);
    return Math.abs(l[0] * p[0] + l[1] * p[1] + l[2]);
  });
  const rms = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
  return { p, rms };
}

function invert3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// ---------------------------------------------------------------- dibujo

const toScreen = (x, y) => [view.x + x * view.scale, view.y + y * view.scale];
const toImage = (sx, sy) => [(sx - view.x) / view.scale, (sy - view.y) / view.scale];
const editor = createPolygonEditor({ ctx, toScreen, onChange: () => draw() });
const polyMode = () => modeSel.value === 'poly';

function draw() {
  cv.width = wrap.clientWidth;
  cv.height = wrap.clientHeight;
  ctx.fillStyle = '#1b1814';
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (img.complete) {
    const [x0, y0] = toScreen(0, 0);
    ctx.drawImage(img, x0, y0, ORIGINAL.width * view.scale, ORIGINAL.height * view.scale);
  }
  if (polyMode()) {
    editor.draw();
    stats.innerHTML = editor.stats();
    return;
  }
  const orthogonals = zoneOnly.checked && zoneSel.value
    ? data.orthogonals.filter((_, i) => data.orthogonalZones?.[i] === zoneSel.value)
    : data.orthogonals;
  const vp = vanishingPoint(orthogonals);
  const seg = (s, color, w) => {
    const [a, b] = toScreen(s[0], s[1]);
    const [c, d] = toScreen(s[2], s[3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  };
  for (const s of orthogonals) {
    if (vp) seg([s[0], s[1], vp.p[0], vp.p[1]], 'rgba(255,60,60,0.5)', 1);
    seg(s, '#2ee65a', 3);
  }
  if (!zoneOnly.checked) for (const s of data.diagonals) seg(s, '#3c82ff', 3);
  if (vp) {
    const [x, y] = toScreen(...vp.p);
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cv.width, y);
    ctx.stroke();
  }
  if (pending) {
    const [x, y] = toScreen(...pending);
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(x - 4, y - 4, 8, 8);
  }
  stats.innerHTML =
    `Ortogonales visibles: ${orthogonals.length} de ${data.orthogonals.length} · Diagonales: ${data.diagonals.length}<br>` +
    (vp ? `Punto de fuga: (${vp.p[0].toFixed(1)}, ${vp.p[1].toFixed(1)}) px<br>Error RMS: ${vp.rms.toFixed(2)} px` : 'Marca al menos 2 ortogonales');
  jsonBox.value = JSON.stringify(data, null, 1);
}

// ---------------------------------------------------------------- interacción

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    drag = { x: e.clientX - view.x, y: e.clientY - view.y };
    return;
  }
  const r = cv.getBoundingClientRect();
  const p = toImage(e.clientX - r.left, e.clientY - r.top).map((v) => Math.round(v * 10) / 10);
  if (polyMode()) {
    editor.onDown(p, e, view.scale);
    draw();
    return;
  }
  if (!pending) pending = p;
  else {
    if (kindSel.value === 'orthogonals') {
      data.orthogonalZones ??= Array(data.orthogonals.length).fill(null);
      data.orthogonalZones.push(zoneSel.value || null);
    }
    data[kindSel.value].push([...pending, ...p]);
    pending = null;
  }
  draw();
});
window.addEventListener('mousemove', (e) => {
  if (polyMode() && !drag) {
    const r = cv.getBoundingClientRect();
    editor.onMove(toImage(e.clientX - r.left, e.clientY - r.top), view.scale);
    draw();
    return;
  }
  if (!drag) return;
  view.x = e.clientX - drag.x;
  view.y = e.clientY - drag.y;
  draw();
});
window.addEventListener('mouseup', () => {
  drag = null;
  editor.onUp();
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const [ix, iy] = toImage(e.clientX - r.left, e.clientY - r.top);
  view.scale *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
  view.x = e.clientX - r.left - ix * view.scale;
  view.y = e.clientY - r.top - iy * view.scale;
  draw();
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (polyMode()) {
    editor.onKey(e.key);
    return;
  }
  if (e.key.toLowerCase() === 'z') {
    if (pending) pending = null;
    else {
      data[kindSel.value].pop();
      if (kindSel.value === 'orthogonals') {
        data.orthogonalZones?.pop();
        if (data.calibrationOrthogonalCount > data.orthogonals.length) {
          data.calibrationOrthogonalCount = data.orthogonals.length;
        }
      }
    }
    draw();
  }
});
window.addEventListener('resize', draw);

document.getElementById('load').onclick = async () => {
  data = await (await fetch(linesUrl)).json();
  draw();
};
zoneSel.addEventListener('change', draw);
zoneOnly.addEventListener('change', draw);
document.getElementById('focus-loggia').onclick = () => {
  kindSel.value = 'orthogonals';
  zoneSel.value = 'logia';
  zoneOnly.checked = true;
  pending = null;
  const scale = Math.min(wrap.clientWidth / 1800, wrap.clientHeight / 980);
  view = { scale, x: (wrap.clientWidth - 1800 * scale) / 2 - 1220 * scale, y: 24 };
  draw();
};
document.getElementById('clear').onclick = () => {
  data[kindSel.value] = [];
  if (kindSel.value === 'orthogonals') {
    data.orthogonalZones = [];
    delete data.calibrationOrthogonalCount;
  }
  draw();
};
document.getElementById('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = 'lines.json';
  a.click();
};
jsonBox.addEventListener('change', () => {
  try {
    data = JSON.parse(jsonBox.value);
    draw();
  } catch {
    stats.textContent = 'JSON inválido';
  }
});

img.onload = () => {
  view.scale = Math.min(wrap.clientWidth / ORIGINAL.width, wrap.clientHeight / ORIGINAL.height) * 0.95;
  document.getElementById('load').click();
};

// ---------------------------------------------------------------- modo polígonos

async function loadScene() {
  const scene = await (await fetch(BASE + 'data/scene.json')).json();
  editor.setScene(scene);
  elementSel.innerHTML = scene.elements
    .map((el) => `<option value="${el.id}">${el.kind === 'figure' ? '● ' : ''}${el.label}</option>`)
    .join('');
  elementSel.value = editor.selected;
  draw();
}

modeSel.addEventListener('change', () => {
  document.body.classList.toggle('poly', polyMode());
  pending = null;
  if (polyMode() && !editor.getScene()) loadScene();
  draw();
});
elementSel.addEventListener('change', () => editor.select(elementSel.value));
document.getElementById('restore').onclick = () => editor.restoreRoi();
document.getElementById('export-scene').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(editor.getScene(), null, 2)], { type: 'application/json' }));
  a.download = 'scene.json';
  a.click();
};
