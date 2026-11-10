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
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Не удалось прочитать ${file}: ${e.message}`);
  }
  // Значения экранируются при подстановке, но ссылка вида javascript:… осталась бы рабочей.
  // Поэтому в ссылки пускаем только обычные адреса, а email проверяем на форму.
  for (const s of data.socials || []) {
    if (!/^(#$|https?:\/\/)/i.test(String(s.url))) throw new Error(`content.json: недопустимая ссылка «${s.url}» у «${s.label}» (нужен адрес, начинающийся с https://)`);
  }
  if (!/^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/.test(String(data.email))) throw new Error('content.json: поле email не похоже на адрес почты');
  return data;
};

const fill = (tpl, ctx) => tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in ctx ? esc(ctx[key]) : m));

const filled = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

// {{поле}} подставляет значение, {{#each список}}...{{/each}} повторяет блок, внутри доступны {{n}} (с 1) и {{art}} (1..5),
// {{#if поле}}...{{/if}} оставляет блок, только если поле не пустое (непустая строка или непустой список),
// {{#unless поле}}...{{/unless}} наоборот, оставляет блок, если поле пустое
function render(html, data) {
  const ctx = { ...data, year: new Date().getFullYear() };
  const out = fill(
    html
    .replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, body) => (filled(data[key]) ? body : ''))
    .replace(/\{\{#unless (\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, key, body) => (filled(data[key]) ? '' : body))
    .replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, body) => {
      if (!Array.isArray(data[key])) throw new Error(`В content.json нет списка «${key}»`);
      return data[key].map((item, i) => fill(body, { ...ctx, ...item, n: i + 1, art: (i % 5) + 1 })).join('');
    }),
    ctx,
  );
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
