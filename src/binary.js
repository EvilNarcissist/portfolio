/*
  Падающие нули и единицы сверху вниз.
  Каждая колонка роняет «голову» (яркий символ), за ней остаётся угасающий след.
  Холст прозрачный, поэтому след гаснет через destination-out и не закрашивает фон.
*/
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function createRain(canvas, options = {}) {
  const {
    size = 20,          // размер клетки в px
    fps = 30,           // шагов в секунду
    head = '#f5f6f8',   // цвет головы
    trail = '#8b94a8',  // цвет следа
    fade = 0.09,        // скорость угасания следа
    density = 1,        // доля занятых колонок, 0..1
  } = options;

  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, cols = [], raf = 0, last = 0, running = false;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rows = Math.ceil(h / size);
    cols = Array.from({ length: Math.ceil(w / size) }, () => ({
      y: -Math.floor(Math.random() * rows * 1.4),
      every: 1 + Math.floor(Math.random() * 3), // колонка падает каждый 1-й, 2-й или 3-й шаг
      t: 0,
      on: Math.random() < density,
    }));
  };

  const bit = () => (Math.random() < 0.5 ? '0' : '1');

  const step = () => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, w, h);

    cols.forEach((c, i) => {
      if (!c.on) return;
      if (++c.t < c.every) return;
      c.t = 0;
      const x = i * size + size / 2;
      if (c.y >= 0 && c.y * size < h + size) {
        // предыдущая голова становится следом
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fillRect(x - size / 2, (c.y - 1) * size, size, size);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = trail;
        ctx.fillText(bit(), x, (c.y - 1) * size + size / 2);
        ctx.fillStyle = head;
        ctx.fillText(bit(), x, c.y * size + size / 2);
      }
      c.y++;
      if (c.y * size > h + size && Math.random() > 0.96) c.y = -Math.floor(Math.random() * 18);
    });
    ctx.globalCompositeOperation = 'source-over';
  };

  const frame = (now) => {
    if (!running) return;
    if (now - last >= 1000 / fps) { last = now; step(); }
    raf = requestAnimationFrame(frame);
  };

  return {
    start() { if (running) return; running = true; resize(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    clear() { ctx.clearRect(0, 0, w, h); },
  };
}
