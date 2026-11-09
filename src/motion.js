import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import Snap from 'lenis/snap';
import 'lenis/dist/lenis.css';

/*
  Механика движения сайта.

  Принципы:
  - главное движение одно: плавный инерционный скролл, всё остальное его поддерживает
  - параллакс только на фоновых слоях и крупном имени, текст абзацев не двигается
  - без JS и при prefers-reduced-motion сайт полностью виден и работает на обычном скролле
*/

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const EASE_OUT = 'expo.out';

/* Заголовок разбивается на слова в «масках»: слова выезжают снизу, не вылезая за строку. */
function splitMask(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const inner = [];
  text.split(/\s+/).forEach((word, i, all) => {
    const mask = document.createElement('span');
    mask.className = 'mw';
    mask.setAttribute('aria-hidden', 'true');
    const w = document.createElement('span');
    w.className = 'mi';
    w.textContent = word;
    mask.appendChild(w);
    el.appendChild(mask);
    if (i < all.length - 1) el.appendChild(document.createTextNode(' '));
    inner.push(w);
  });
  return inner;
}

export function initMotion({ reduce, fine, root }) {
  const nav = $('#nav');
  const menu = $('#menu');

  // без движения: обычный скролл браузера, всё уже на своих местах
  if (reduce) {
    return {
      stop() {},
      start() {},
      to(target) { target?.scrollIntoView?.(); },
    };
  }

  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('motion');   // включает стили, которым нужен скрипт (закреплённый абзац, панель, фокус строк)

  /* ---------- плавный скролл ---------- */
  const lenis = new Lenis({
    lerp: 0.085,          // чем меньше, тем длиннее «инерция»
    wheelMultiplier: 0.95,
    smoothWheel: true,
    anchors: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // пока идёт загрузка, страница не листается
  const loading = root.classList.contains('loading');
  if (loading) lenis.stop();
  const ready = () => { lenis.start(); ScrollTrigger.refresh(); };
  if (loading) document.addEventListener('site:ready', ready, { once: true });

  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  let expPin = null;   // закрепление блока «Опыт», нужно ссылке меню и притяжению
  const to = (target, opts = {}) => lenis.scrollTo(target, {
    duration: 1.5,                 // отступ под шапку берётся из scroll-padding-top в CSS
    easing: easeOutQuart,
    ...opts,
  });

  // якорные ссылки едут плавно, а не прыгают
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href');
    if (hash.length < 2) return;                 // заглушки «#»
    const target = hash === '#top' ? 0 : $(hash);
    if (target === null) return;
    e.preventDefault();
    // «Опыт» закреплён на экране, поэтому едем туда, где он виден целиком
    to(hash === '#experience' && expPin ? expPin.start : target);
    history.replaceState(null, '', hash);
  });

  /* ---------- индикатор прокрутки ---------- */
  gsap.to('#progress', {
    scaleX: 1, ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.25 },
  });

  /* ---------- шапка прячется вниз и возвращается вверх ---------- */
  lenis.on('scroll', ({ direction, scroll }) => {
    if (!menu.hidden) return;
    if (direction === 1 && scroll > 260) nav.classList.add('hide');
    else if (direction === -1 || scroll <= 260) nav.classList.remove('hide');
  });

  /* ---------- hero: буквы имени разлетаются при прокрутке, фон отстаёт ---------- */
  // после вступления маска строки больше не нужна, иначе разлетающиеся буквы обрежутся
  const freeName = () => setTimeout(() => $('.name')?.classList.add('free'), 1500);
  if (loading) document.addEventListener('site:ready', freeName, { once: true }); else freeName();

  const letters = $$('.name .ch');
  const hero = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 25%', scrub: 0.6 },
  });
  if (letters.length) {
    hero.to(letters, {
      yPercent: () => gsap.utils.random(-170, -60),
      xPercent: () => gsap.utils.random(-40, 40),
      rotation: () => gsap.utils.random(-24, 24),
      opacity: 0,
      stagger: { each: 0.03, from: 'random' },
    }, 0);
  } else {
    hero.to('.name', { yPercent: -14, opacity: 0.2 }, 0);
  }
  hero
    .to('.hero-bottom', { yPercent: -40, opacity: 0 }, 0)
    .to('.hero .rain', { yPercent: 30 }, 0);

  /* ---------- «Обо мне»: абзац закрепляется, слова загораются по мере прокрутки ---------- */
  (() => {
    const words = $$('#statement .w');
    if (!words.length) return;
    // Слова загораются строго по одному, в порядке чтения: на каждое слово отведён свой отрезок прокрутки,
    // поэтому одновременно «горит» не больше одного слова, все предыдущие уже яркие, все следующие тусклые.
    const n = words.length;
    const NOTE = 6;                                   // длина появления подписи под абзацем, в тех же долях
    const px = () => Math.max(innerHeight * 1.2, (n + NOTE) * 44);   // ~44 px прокрутки на слово
    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#about', start: 'top top', end: () => '+=' + px(), pin: true, scrub: 0.35, invalidateOnRefresh: true },
    })
      .to(words, { opacity: 1, duration: 1, stagger: 1 }, 0)
      .fromTo('.about-note', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: NOTE }, '>');
  })();

  /* ---------- «Услуги»: тёмная панель разворачивается на всю ширину ---------- */
  gsap.fromTo('#services', { '--sc': 0.86 }, {
    '--sc': 1, ease: 'none',
    scrollTrigger: { trigger: '#services', start: 'top bottom', end: 'top 25%', scrub: true },
  });

  /* ---------- крупная лента: строки едут навстречу друг другу ---------- */
  $$('.band-row').forEach((row) => {
    const dir = +row.dataset.dir;      // -1 влево, 1 вправо
    gsap.fromTo(row, { xPercent: dir === -1 ? 0 : -38 }, {
      xPercent: dir === -1 ? -38 : 0, ease: 'none',
      scrollTrigger: { trigger: '.band', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
    });
  });

  /* ---------- заголовки: слова выезжают из масок ---------- */
  $$('#works-h, #services-h, #exp-h, .big').forEach((h) => {
    const words = splitMask(h);
    gsap.set(words, { yPercent: 115 });
    ScrollTrigger.create({
      trigger: h, start: 'top 88%', once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.15, ease: EASE_OUT, stagger: 0.07 }),
    });
  });

  /* ---------- строки списков: линия прорисовывается, строки выплывают по очереди ---------- */
  // у каждого блока своё появление: wipe — «шторка» сверху вниз, x — въезд сбоку, y — подъём
  const pending = new Map();   // элемент -> его настройки
  const play = (els) => {
    // элементы с одинаковыми настройками анимируются одной очередью
    const groups = new Map();
    els.forEach((el) => {
      const cfg = pending.get(el);
      if (!cfg) return;
      pending.delete(el);
      groups.set(cfg, [...(groups.get(cfg) || []), el]);
    });
    groups.forEach((batch, cfg) => {
      gsap.to(batch, {
        opacity: 1, x: 0, y: 0,
        ...(cfg.line ? { '--draw': 1 } : {}),
        ...(cfg.wipe ? { clipPath: 'inset(0% 0% 0% 0%)' } : {}),
        duration: cfg.wipe ? 1.2 : 1, ease: cfg.wipe ? 'expo.out' : 'power3.out',
        stagger: 0.1, overwrite: 'auto',
        clearProps: 'transform,opacity,clipPath',
        onComplete() { if (cfg.line) batch.forEach((el) => el.style.removeProperty('--draw')); },
      });
    });
  };
  const reveal = (selector, cfg = {}) => {
    const { y = 28, x = 0, start = 'top 90%' } = cfg;
    const items = $$(selector);
    if (!items.length) return;
    gsap.set(items, {
      opacity: 0, x, y,
      ...(cfg.line ? { '--draw': 0 } : {}),
      ...(cfg.wipe ? { clipPath: 'inset(0% 0% 100% 0%)' } : {}),
    });
    items.forEach((el) => pending.set(el, cfg));
    ScrollTrigger.batch(items, { start, once: true, onEnter: (batch) => play(batch) });
  };
  // страховка: если элемент не успел войти в зону срабатывания, показываем его у самого конца страницы
  lenis.on('scroll', ({ scroll, limit }) => {
    if (pending.size && limit - scroll < 6) play([...pending.keys()]);
  });
  reveal('.work', { line: true, wipe: true, y: 0 });       // проекты: открываются «шторкой»
  reveal('.svc', { line: true, y: 0, x: 56 });             // услуги: въезжают справа
  reveal('.exp li', { y: 24 });                            // опыт: поднимается, годы набегают (ниже)
  reveal('.mail, .foot', { y: 24, start: 'top 98%' });

  /* ---------- «Опыт»: линия растёт вдоль списка, годы набегают ---------- */
  gsap.fromTo('.exp', { '--grow': 0 }, {
    '--grow': 1, ease: 'none',
    scrollTrigger: { trigger: '.exp', start: 'top 80%', end: 'bottom 60%', scrub: true },
  });
  $$('.exp-date').forEach((el) => {
    const text = el.textContent;
    if (!/\d{4}/.test(text)) return;
    ScrollTrigger.create({
      trigger: el, start: 'top 95%', once: true,
      onEnter: () => {
        const o = { p: 0 };
        gsap.to(o, {
          p: 1, duration: 1.6, ease: 'power3.out',
          onUpdate: () => { el.textContent = text.replace(/\d{4}/g, (m) => String(Math.round(+m - (1 - o.p) * 9))); },
          onComplete: () => { el.textContent = text; },
        });
      },
    });
  });

  /* ---------- «Контакты»: выезжают поверх «Опыта» как лист, тот уходит вглубь ---------- */
  (() => {
    const exp = $('#experience');
    if (!exp || !$('.contact')) return;
    const end = () => '+=' + innerHeight;
    expPin = ScrollTrigger.create({ trigger: exp, start: 'bottom bottom', end, pin: true, pinSpacing: false });
    gsap.to(exp, {
      scale: 0.9, opacity: 0.3, transformOrigin: '50% 100%', ease: 'none',
      scrollTrigger: { trigger: exp, start: 'bottom bottom', end, scrub: true },
    });
  })();

  /* ---------- мягкое притяжение к началу блока, когда вы остановились рядом ---------- */
  (() => {
    const snap = new Snap(lenis, { type: 'proximity', distanceThreshold: '22%', debounce: 450, duration: 1.1, easing: easeOutQuart });
    // «Контакты» не притягиваем: страница должна свободно доходить до самого низа
    const anchors = [
      ['#works', 'top 88px'], ['#services', 'top 70px'],
    ].map(([sel, start]) => ScrollTrigger.create({ trigger: sel, start }));
    let removers = [];
    const build = () => {
      removers.forEach((r) => r());
      const points = [0, ...anchors.map((st) => st.start)];
      if (expPin) points.push(expPin.start);     // «Опыт» виден целиком
      removers = points.map((v) => snap.add(Math.round(v)));
    };
    ScrollTrigger.addEventListener('refresh', build);
    build();
  })();

  /* ---------- контакты: код-дождь поднимается навстречу ---------- */
  gsap.fromTo('.contact .rain', { yPercent: 28 }, {
    yPercent: 0, ease: 'none',
    scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });

  /* ---------- бегущая строка: скорость и направление следуют за скроллом ---------- */
  (() => {
    const track = $('.track');
    if (!track) return;
    track.style.animation = 'none';
    let x = 0, mul = 1, half = 0;
    const measure = () => { half = track.scrollWidth / 2; };
    measure();
    addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    const BASE = () => half / 46;     // как раньше: один круг за 46 секунд

    gsap.ticker.add((_, dt) => {
      const v = lenis.velocity;
      // вверх строка плавно разворачивается, после остановки возвращается к обычному ходу
      const dir = Math.abs(v) > 0.4 ? Math.sign(v) : 1;
      const target = dir * (1 + clamp(Math.abs(v) * 0.14, 0, 7));
      mul += (target - mul) * 0.07;
      x = (x + BASE() * mul * (dt / 1000) + half) % half;
      track.style.transform = `translate3d(${-x}px, 0, 0)`;
    });
  })();

  /* ---------- списки наклоняются по скорости скролла ---------- */
  (() => {
    const els = $$('.list, .stack, .exp');
    const setters = els.map((el) => gsap.quickSetter(el, 'skewY', 'deg'));
    let sk = 0, last = 0;
    gsap.ticker.add(() => {
      const target = clamp(-lenis.velocity * 0.05, -2.6, 2.6);
      sk += (target - sk) * 0.12;
      if (Math.abs(sk) < 0.004) sk = 0;
      if (sk !== last) { setters.forEach((set) => set(sk)); last = sk; }
    });
  })();

  /* ---------- «магнитные» кнопки ---------- */
  if (fine) {
    $$('.btn, .copy').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.25);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  // шрифты меняют высоту строк, поэтому пересчитываем точки срабатывания
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return {
    stop: () => lenis.stop(),
    start: () => lenis.start(),
    to,
  };
}
