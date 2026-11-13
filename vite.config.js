import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
  Личные данные (имя, тексты, email, соцсети) живут в content.json.
  Этот файл в git не попадает (см. .gitignore). Если его нет, берётся content.example.json
  с обезличенными заглушками. На GitHub файл собирается из секрета SITE_CONTENT,
  см. .github/workflows/deploy.yml.
*/

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const contentFile = () => {
  const own = resolve('content.json');
  return existsSync(own) ? own : resolve('content.example.json');
};

const loadContent = () => {
  const file = contentFile();
  let data;
  try {
    const raw = readFileSync(file, 'utf8');
    // Если русский текст при копировании прошёл через неверную кодировку, в нём появляются математические
    // знаки (∞ ≤ ≥ и т. п.) и символ-заместитель. В настоящих текстах их нет, поэтому лучше остановить
    // сборку, чем опубликовать сайт с «кракозябрами».
    if (/[∀-⋿�]/.test(raw)) {
      throw new Error('в тексте есть символы, которых не бывает в обычных текстах: вероятно, сломана кодировка. Скопируйте файл заново: LC_ALL=en_US.UTF-8 pbcopy < content.json');
    }
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Не удалось прочитать ${file}: ${e.message}`);
  }
  // Значения экранируются при подстановке, но ссылка вида javascript:… осталась бы рабочей.
  // Поэтому в ссылки пускаем только обычные адреса, а email проверяем на форму.
  for (const s of data.socials || []) {
    if (!/^(#$|https?:\/\/)/i.test(String(s.url))) throw new Error(`content.json: недопустимая ссылка «${s.url}» у «${s.label}» (нужен адрес, начинающийся с https://)`);
  }
  for (const p of data.projects || []) {
    for (const key of ['link', 'link2']) {
      if (p[key] && !/^https?:\/\//i.test(String(p[key]))) throw new Error(`content.json: недопустимая ссылка «${p[key]}» (${key}) у проекта «${p.title}»`);
    }
    // видео и постер лежат в public/media (путь /media/…) или по https-адресу
    for (const key of ['video', 'poster']) {
      if (p[key] && !/^(\/media\/[\w.-]+|https:\/\/)/.test(String(p[key]))) throw new Error(`content.json: «${key}» у проекта «${p.title}» должен быть вида /media/файл или https://…`);
      // без самого файла Vite не поправит путь, и на адресе в подпапке (GitHub Pages) ролик не загрузится
      if (p[key] && String(p[key]).startsWith('/media/') && !existsSync(resolve('public', String(p[key]).slice(1)))) throw new Error(`content.json: файла нет на диске: public${p[key]} (положите его в public/media/)`);
    }
    // для превью-картинки при наведении нужен путь без начального «/», чтобы он работал и в подпапке (GitHub Pages)
    p.posterRel = p.poster && p.poster.startsWith('/') ? p.poster.slice(1) : (p.poster || '');
  }
  if (!/^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/.test(String(data.email))) throw new Error('content.json: поле email не похоже на адрес почты');

  // Слова для бегущей строки (marquee) и крупной ленты (band): чередуем сплошной и контурный стиль,
  // список повторяем, пока он не станет достаточно длинным, чтобы заполнить ширину экрана.
  const words = (list, name) => {
    if (!Array.isArray(list) || list.length === 0) throw new Error(`content.json: нужен непустой список «${name}»`);
    const long = [];
    while (long.length < 6) long.push(...list);
    return long.map((text, i) => ({ text, tag: i % 2 ? 'em' : 'b' }));
  };
  data.marqueeItems = words(data.marquee, 'marquee');
  data.bandA = words(data.bandRow1, 'bandRow1');
  data.bandB = words(data.bandRow2, 'bandRow2');
  return data;
};

const fill = (tpl, ctx) => tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in ctx ? esc(ctx[key]) : m));

const filled = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

// {{поле}} подставляет значение, {{#each список}}...{{/each}} повторяет блок, внутри доступны {{n}} (с 1) и {{art}} (1..5),
// {{#if поле}}...{{/if}} оставляет блок, только если поле не пустое (непустая строка или непустой список),
// {{#unless поле}}...{{/unless}} наоборот, оставляет блок, если поле пустое
// условия считаются по тому контексту, где стоят: внутри {{#each}} по полям элемента, снаружи по полям верхнего уровня
// Условия могут быть вложенными: сначала раскрываются самые внутренние (тело без других {{#if}} / {{#unless}}), потом внешние.
const cond = (s, c) => {
  const inner = (name) => new RegExp(`\\{\\{#${name} (\\w+)\\}\\}((?:(?!\\{\\{#(?:if|unless) )[\\s\\S])*?)\\{\\{\\/${name}\\}\\}`, 'g');
  let prev;
  do {
    prev = s;
    s = s
      .replace(inner('if'), (_, key, body) => (filled(c[key]) ? body : ''))
      .replace(inner('unless'), (_, key, body) => (filled(c[key]) ? '' : body));
  } while (s !== prev);
  return s;
};

function render(html, data) {
  const ctx = { ...data, year: new Date().getFullYear() };
  const expanded = html.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, body) => {
    if (!Array.isArray(data[key])) throw new Error(`В content.json нет списка «${key}»`);
    return data[key].map((item, i) => {
      const c = { ...ctx, ...item, n: i + 1, art: (i % 5) + 1 };
      return fill(cond(body, c), c);
    }).join('');
  });
  const out = fill(cond(expanded, ctx), ctx);
  const missing = out.match(/\{\{\w+\}\}/g);
  if (missing) throw new Error(`В content.json не хватает полей: ${[...new Set(missing)].join(', ')}`);
  return out;
}

const faviconSvg = (initials) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1f4d"/><text x="32" y="42" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" fill="#f1f3f7">${esc(initials)}</text></svg>`;

const personalContent = () => ({
  name: 'personal-content',
  transformIndexHtml: { order: 'pre', handler: (html) => render(html, loadContent()) },
  // иконка вкладки рисуется из инициалов
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: faviconSvg(loadContent().initials) });
  },
  configureServer(server) {
    server.watcher.add(contentFile());
    server.watcher.on('change', (f) => { if (f.endsWith('content.json') || f.endsWith('content.example.json')) server.ws.send({ type: 'full-reload' }); });
    server.middlewares.use('/favicon.svg', (_req, res) => {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end(faviconSvg(loadContent().initials));
    });
  },
});

// './' — пути к файлам относительные, поэтому сайт работает и на корне домена,
// и в подпапке (например, на GitHub Pages: user.github.io/portfolio/)
export default defineConfig({ base: './', plugins: [personalContent()] });
