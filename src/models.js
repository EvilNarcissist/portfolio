/*
  Каркасные 3D-модели в стиле сайта: тонкие линии и нули с единицами в вершинах.
  Свой маленький рендер на canvas 2D (поворот + перспектива), без 3D-библиотек.
  Модель сама ничего не анимирует: углы и масштаб лежат в state, их меняет motion.js.
*/
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// рёбра = все пары вершин на заданном расстоянии
const edgesAt = (v, d, eps = 0.02) => {
  const out = [];
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      if (Math.abs(Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) - d) < eps) out.push([i, j]);
    }
  }
  return out;
};

// куб в кубе: «рамки и сетка», дизайн
function frames() {
  const cube = (s) => [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x * s, y * s, z * s])));
  const O = 0.6, I = 0.28;
  const v = [...cube(O), ...cube(I)];
  const e = [...edgesAt(v.slice(0, 8), O * 2), ...edgesAt(v.slice(8), I * 2).map(([a, b]) => [a + 8, b + 8])];
  for (let i = 0; i < 8; i++) e.push([i, i + 8]);
  return { v, e, glyphs: v.map((_, i) => i).filter((i) => i < 8) };
}

// тор: «петля», движение
function loop() {
  const R = 0.74, r = 0.3, U = 22, V = 8;
  const v = [], e = [];
  for (let u = 0; u < U; u++) {
    for (let k = 0; k < V; k++) {
      const a = (u / U) * Math.PI * 2, b = (k / V) * Math.PI * 2;
      v.push([(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)]);
      e.push([u * V + k, ((u + 1) % U) * V + k], [u * V + k, u * V + ((k + 1) % V)]);
    }
  }
  const glyphs = [];
  for (let u = 0; u < U; u += 2) glyphs.push(u * V);   // по внешнему ободу, через одну
  return { v, e, glyphs };
}

// икосаэдр: «кристалл», код
function crystal() {
  const t = (1 + Math.sqrt(5)) / 2, n = Math.hypot(1, t);
  const v = [];
  for (const a of [-1, 1]) for (const b of [-t, t]) v.push([0, a / n, b / n], [a / n, b / n, 0], [b / n, 0, a / n]);
  return { v, e: edgesAt(v, 2 / n), glyphs: v.map((_, i) => i) };
}

export function createModel(canvas, { line = '197, 203, 216', glyph = '245, 246, 248' } = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const shapes = [frames(), loop(), crystal()];
  const state = { rx: -0.5, ry: 0.6, zoom: 1, shape: 0 };
  let w = 0, h = 0;
  const P = [];   // спроецированные вершины: [x, y, глубина, масштаб перспективы]

  const project = ([x, y, z], k, i) => {
    const cy = Math.cos(state.ry), sy = Math.sin(state.ry), cx = Math.cos(state.rx), sx = Math.sin(state.rx);
    const x1 = x * cy + z * sy, z1 = z * cy - x * sy;      // вокруг вертикальной оси
    const y2 = y * cx - z1 * sx, z2 = z1 * cx + y * sx;    // наклон
    const f = 3.2 / (3.2 - z2);                             // перспектива, камера на расстоянии 3.2
    P[i] = [w / 2 + x1 * f * k, h / 2 + y2 * f * k, z2, f];
  };
  const alpha = (z) => Math.min(1, Math.max(0.12, 0.12 + 0.88 * (z + 1.05) / 2.1));   // дальние линии тусклее

  const render = () => {
    ctx.clearRect(0, 0, w, h);
    const s = shapes[state.shape];
    const k = Math.min(w, h) * 0.37 * state.zoom;
    if (k <= 0.5) return;
    s.v.forEach((p, i) => project(p, k, i));

    ctx.lineWidth = 1.1;
    for (const [a, b] of s.e) {
      ctx.strokeStyle = `rgba(${line}, ${(alpha((P[a][2] + P[b][2]) / 2) * 0.85).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(P[a][0], P[a][1]);
      ctx.lineTo(P[b][0], P[b][1]);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const i of s.glyphs) {
      const [x, y, z, f] = P[i];
      // цифра стоит чуть снаружи вершины
      const gx = w / 2 + (x - w / 2) * 1.16, gy = h / 2 + (y - h / 2) * 1.16;
      ctx.font = `${Math.max(8, 12 * f * Math.min(1, w / 300))}px ${FONT}`;
      ctx.fillStyle = `rgba(${glyph}, ${alpha(z).toFixed(3)})`;
      ctx.fillText(i % 3 === 0 ? '0' : '1', gx, gy);
    }
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else addEventListener('resize', resize);
  resize();

  return {
    canvas, state, render,
    count: shapes.length,
    setShape(i, draw = true) { state.shape = ((i % shapes.length) + shapes.length) % shapes.length; if (draw) render(); },
  };
}
