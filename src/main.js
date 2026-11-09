import './styles.css';
import { createRain } from './binary.js';
import { initMotion } from './motion.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const root = document.documentElement;

/* ---------- загрузка: маленькие инициалы с этапом загрузки сбоку, позади бегут нули и единицы ---------- */
(() => {
  const loader = $('#loader');
  if (!root.classList.contains('loading')) return;

  const num = $('#loaderNum');
  const bar = $('#loaderBar');
  const rain = createRain($('#loaderRain'), { size: innerWidth < 600 ? 16 : 20, fps: 32, fade: 0.09 });
  const mark = $('.loader-mark');
  const REVEAL = 1300;     // этап 1: только двоичный код
  const DURATION = 3000;   // этап 2: появляются инициалы и счётчик, затем сайт открывается
  const t0 = performance.now();
  let finished = false;
  rain.start();

  const finish = () => {
    if (finished) return;
    finished = true;
    num.textContent = '100';
    bar.style.transform = 'scaleX(1)';
    loader.classList.add('done');      // шторка уезжает вверх
    root.classList.remove('loading');  // и сразу стартует анимация имени
    document.dispatchEvent(new Event('site:ready'));
    setTimeout(() => { rain.stop(); loader.remove(); }, 1000);
  };

  const tick = (now) => {
    if (finished) return;
    const t = now - t0;
    if (t >= REVEAL) mark.classList.add('show');
    const p = clamp(t / DURATION, 0, 1);
    const q = clamp((t - REVEAL) / (DURATION - REVEAL), 0, 1);   // счётчик идёт, пока видны инициалы
    num.textContent = String(Math.round((1 - Math.pow(1 - q, 2.2)) * 100)).padStart(3, '0');
    bar.style.transform = `scaleX(${p})`;
    if (p < 1) requestAnimationFrame(tick); else finish();
  };
  requestAnimationFrame(tick);

  addEventListener('resize', () => { if (!finished) rain.resize(); });
  // загрузку можно пропустить
  loader.addEventListener('click', finish);
  addEventListener('keydown', finish, { once: true });
})();

let motion = { stop() {}, start() {} };   // настоящий объект появляется в конце файла, когда вся разметка уже подготовлена

/* ---------- двоичный дождь в hero и в контактах ---------- */
(() => {
  if (reduce || !('IntersectionObserver' in window)) return;
  $$('canvas.rain').forEach((canvas) => {
    const rain = createRain(canvas, {
      size: innerWidth < 600 ? 18 : 22, fps: 20, head: '#c5cbd8', trail: '#59627a', fade: 0.07, density: 0.6,
    });
    let visible = false;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) rain.start(); else rain.stop();
    }).observe(canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) rain.stop(); else if (visible) rain.start();
    });
    addEventListener('resize', () => { if (visible) rain.resize(); });
  });
})();

/* ---------- nav and mobile menu ---------- */
const nav = $('#nav');
const menu = $('#menu');
const menuBtn = $('#menuBtn');

function setMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  document.body.classList.toggle('locked', open);
  if (open) { motion.stop(); nav.classList.remove('hide'); } else motion.start();
  if (open) $('a', menu).focus();
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); }
});
matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

/* ---------- accordions (works, services) ---------- */
$$('[data-acc]').forEach((group) => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.acc-btn');
    if (!btn) return;
    const item = btn.closest('.acc');
    const open = !item.hasAttribute('data-open');
    $$('.acc', group).forEach((other) => {
      other.toggleAttribute('data-open', false);
      $('.acc-btn', other).setAttribute('aria-expanded', 'false');
    });
    if (open) {
      item.setAttribute('data-open', '');
      btn.setAttribute('aria-expanded', 'true');
    }
    preview.hide();
  });
});

/* ---------- project preview that follows the cursor ---------- */
const preview = (() => {
  const noop = { hide() {} };
  if (!fine || reduce) return noop;

  const el = $('#preview');
  const arts = $$('.art', el);
  let x = 0, y = 0, tx = 0, ty = 0, active = false, raf = 0;

  const frame = () => {
    x += (tx - x) * 0.14;
    y += (ty - y) * 0.14;
    const tilt = clamp((tx - x) * 0.05, -9, 9);
    el.style.transform = `translate3d(${x + 28}px, ${y - 90}px, 0) rotate(${tilt}deg)`;
    raf = active ? requestAnimationFrame(frame) : 0;
  };
  const show = (n) => {
    if (!active) { x = tx; y = ty; }
    active = true;
    el.classList.add('on');
    arts.forEach((a, i) => a.classList.toggle('on', i + 1 === n));
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const hide = () => { active = false; el.classList.remove('on'); };

  addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  $$('.work').forEach((row) => {
    row.addEventListener('mouseenter', () => { if (!row.hasAttribute('data-open')) show(+row.dataset.art); });
    row.addEventListener('mouseleave', hide);
  });
  return { hide };
})();

/* ---------- hero: буквы режутся для всех, а с мышью становятся жирнее рядом с курсором ---------- */
(() => {
  if (reduce) return;
  const hero = $('.hero');
  const BASE = 500, MAX = 800, RADIUS = 230;
  const letters = [];

  $$('.name .line > span').forEach((line) => {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');
    for (const ch of text) {
      const el = document.createElement('span');
      el.className = 'ch';
      el.textContent = ch;
      line.appendChild(el);
      letters.push({ el, w: BASE, target: BASE, cx: 0, cy: 0 });
    }
  });

  if (!fine) return;

  const measure = () => {
    letters.forEach((l) => {
      const r = l.el.getBoundingClientRect();
      l.cx = r.left + r.width / 2 + scrollX;
      l.cy = r.top + r.height / 2 + scrollY;
    });
  };
  // the intro animation moves the letters, so measure once it has finished
  setTimeout(measure, 1600);
  addEventListener('resize', measure);
  document.fonts?.ready.then(() => setTimeout(measure, 100));

  let raf = 0;
  const frame = () => {
    let moving = false;
    for (const l of letters) {
      const d = l.target - l.w;
      if (Math.abs(d) > 0.4) { l.w += d * 0.16; moving = true; } else { l.w = l.target; }
      l.el.style.fontWeight = Math.round(l.w);
    }
    raf = moving ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  hero.addEventListener('mousemove', (e) => {
    const px = e.clientX + scrollX, py = e.clientY + scrollY;
    for (const l of letters) {
      const t = clamp(1 - Math.hypot(px - l.cx, py - l.cy) / RADIUS, 0, 1);
      l.target = BASE + (MAX - BASE) * t * t;
    }
    kick();
  }, { passive: true });
  hero.addEventListener('mouseleave', () => { letters.forEach((l) => { l.target = BASE; }); kick(); });
})();

/* ---------- statement lights up word by word while scrolling ---------- */
(() => {
  const el = $('#statement');
  if (reduce) return;
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  const spans = words.map((word, i) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = word;
    el.appendChild(s);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    return s;
  });
  void spans; // подсветкой слов управляет motion.js (абзац закрепляется на экране)
})();

/* ---------- фон шапки при прокрутке ---------- */
(() => {
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ---------- copy email ---------- */
(() => {
  const addr = $('#addr');
  const btn = $('#copy');
  const label = btn.textContent;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(addr.textContent);
      btn.textContent = 'Скопировано';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(addr);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = 'Нажмите Cmd+C';
    }
    setTimeout(() => { btn.textContent = label; }, 1800);
  });
})();

/* ---------- движение при скролле (после подготовки всей разметки) ---------- */
motion = initMotion({ reduce, fine, root });
