// lazy-pulse: lazy-loading audit for a built static site. Finds below-the-fold images and iframes without
// loading="lazy", and LCP candidates that are lazy-loaded, JS-lazy-loaded or deprioritised.
// Static heuristic (document order, no layout engine). Zero dependencies. Louis Wright, MIT.
import { runBeacon, finder, contentPages, ancestor } from './site.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { loadSite, parseHtml, SITE_OPTIONS, SITE_HELP } from './site.js';

export const RULES = {
  'lazy-lcp-lazy': { severity: 'high', title: 'LCP candidate image has loading="lazy" (delays the largest paint)' },
  'lazy-lcp-js': { severity: 'high', title: 'LCP candidate is lazy-loaded by JavaScript (data-src, no real src)' },
  'lazy-preload-conflict': { severity: 'high', title: 'Image is preloaded but its <img> has loading="lazy"' },
  'lazy-lcp-low-priority': { severity: 'medium', title: 'LCP candidate has fetchpriority="low"' },
  'lazy-img-missing': { severity: 'medium', title: 'Below-the-fold image without loading="lazy"' },
  'lazy-iframe-missing': { severity: 'medium', title: 'Below-the-fold iframe without loading="lazy"' },
  'lazy-above-fold-lazy': { severity: 'low', title: 'Image near the top of the page is lazy-loaded' },
  'lazy-no-dimensions': { severity: 'low', title: 'Lazy-loaded image without width/height (layout shift when it loads)' },
  'lazy-js-library': { severity: 'low', title: 'JavaScript lazy-loading (data-src) where native loading="lazy" would do' },
  'lazy-lcp-no-priority': { severity: 'info', title: 'LCP candidate has no fetchpriority="high"' },
};
export const DEFAULTS = { foldImages: 1, iconSize: 64 };
const JS_SRC = ['data-src', 'data-lazy-src', 'data-original', 'data-srcset'];
const isLazy = (el) => String(el.attrs.loading || '').toLowerCase() === 'lazy';
const jsLazy = (el) => JS_SRC.some((k) => el.attrs[k] != null) && (!el.attrs.src || /^data:|placeholder|blank|spacer|1x1/i.test(el.attrs.src));
const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const srcOf = (el) => (jsLazy(el) ? el.attrs['data-src'] || el.attrs['data-lazy-src'] || el.attrs['data-original'] : el.attrs.src) || el.attrs.src || '';
const urlKey = (s) => String(s || '').split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/, '').replace(/^\.?\/?/, '/');

/** Media elements of a page in document order with classification: [{ el, kind, icon, chrome }]. */
export function mediaOf(doc, opts = {}) {
  const iconSize = opts.iconSize ?? DEFAULTS.iconSize; const out = [];
  for (const el of doc.all) {
    if (el.inHead || ancestor(el, (n) => n.tag === 'noscript' || n.tag === 'template')) continue;
    if (el.tag === 'img') {
      const w = num(el.attrs.width); const h = num(el.attrs.height); const src = srcOf(el);
      const icon = (w != null && w <= iconSize && (h == null || h <= iconSize)) || (h != null && h <= iconSize && w == null) || /^data:/i.test(src) && !jsLazy(el) || el.attrs['aria-hidden'] === 'true' && w != null && w <= iconSize * 2;
      const pixel = (w === 1 && h === 1) || /display\s*:\s*none/.test(el.attrs.style || '');
      if (pixel) continue;
      out.push({ el, kind: 'img', icon, chrome: !!ancestor(el, (n) => n.tag === 'nav' || n.tag === 'footer' || (n.tag === 'header' && !ancestor(n, (m) => m.tag === 'main' || m.tag === 'article'))) });
    } else if (el.tag === 'iframe' && (el.attrs.src || el.attrs['data-src'])) out.push({ el, kind: 'iframe', icon: false, chrome: false });
  }
  return out;
}

/** The likely LCP image: fetchpriority=high, else a preloaded image, else the first non-icon content image. */
export function lcpCandidate(doc, media) {
  const imgs = media.filter((m) => m.kind === 'img');
  const hi = imgs.find((m) => String(m.el.attrs.fetchpriority).toLowerCase() === 'high'); if (hi) return hi;
  const pre = new Set(doc.all.filter((e) => e.tag === 'link' && /preload/i.test(e.attrs.rel || '') && e.attrs.as === 'image').map((e) => urlKey(e.attrs.href)));
  const p = imgs.find((m) => pre.has(urlKey(srcOf(m.el)))); if (p) return p;
  return imgs.find((m) => !m.icon && !m.chrome) || null;
}

function analyze(site, opts, config) {
  const { findings, add } = finder(RULES);
  const fold = opts.foldImages ?? config.foldImages ?? DEFAULTS.foldImages;
  const pages = contentPages(site); let media = 0; let lazyCount = 0;
  for (const pg of pages) {
    const doc = pg.doc; const all = mediaOf(doc, config); media += all.length;
    const lcp = lcpCandidate(doc, all);
    const pre = doc.all.filter((e) => e.tag === 'link' && /preload/i.test(e.attrs.rel || '') && e.attrs.as === 'image');
    const loc = (el) => ({ file: pg.file, line: el.line });
    let contentIdx = 0;
    for (const m of all) {
      const { el } = m; const src = srcOf(el) || el.attrs.src || ''; const name = src.split('/').pop()?.split(/[?#]/)[0] || el.tag;
      if (isLazy(el) || jsLazy(el)) lazyCount++;
      if (m === lcp) {
        if (isLazy(el)) add('lazy-lcp-lazy', `${pg.path} ${name}`, `LCP candidate ${name} on ${pg.path} has loading="lazy"`, 'Remove loading="lazy" from the hero/first content image and add fetchpriority="high".', loc(el));
        else if (jsLazy(el)) add('lazy-lcp-js', `${pg.path} ${name}`, `LCP candidate ${name} on ${pg.path} is lazy-loaded by JavaScript (${JS_SRC.find((k) => el.attrs[k] != null)})`, 'Give the hero image a real src (and fetchpriority="high"); exclude it from the lazy-load library.', loc(el));
        if (String(el.attrs.fetchpriority).toLowerCase() === 'low') add('lazy-lcp-low-priority', `${pg.path} ${name}`, `LCP candidate ${name} on ${pg.path} has fetchpriority="low"`, 'Use fetchpriority="high" on the LCP image.', loc(el));
        else if (!el.attrs.fetchpriority && !isLazy(el) && !jsLazy(el)) add('lazy-lcp-no-priority', `${pg.path} ${name}`, `LCP candidate ${name} on ${pg.path} has no fetchpriority`, 'Add fetchpriority="high" to the hero image.', loc(el));
        continue;
      }
      const above = m.kind === 'img' ? (!m.icon && !m.chrome ? contentIdx++ < fold : !!(m.chrome && ancestor(el, (n) => n.tag === 'header'))) : false;
      if (m.kind === 'iframe') { if (!isLazy(el) && !jsLazy(el)) add('lazy-iframe-missing', `${pg.path} ${name}`, `iframe ${el.attrs.src || name} on ${pg.path} is not lazy-loaded`, 'Add loading="lazy" to embeds (video, maps, widgets) or use a click-to-load facade.', loc(el)); continue; }
      if (m.icon) continue;
      if (above) { if (isLazy(el) && !m.chrome) add('lazy-above-fold-lazy', `${pg.path} ${name}`, `${name} is among the first ${fold} content images on ${pg.path} but has loading="lazy"`, 'Load images near the top eagerly; lazy-load from the fold down. Adjust foldImages if your layout differs.', loc(el)); continue; }
      if (!isLazy(el) && !jsLazy(el)) { if (!m.chrome || ancestor(el, (n) => n.tag === 'footer')) add('lazy-img-missing', `${pg.path} ${name}`, `Below-the-fold image ${name} on ${pg.path} has no loading="lazy"`, 'Add loading="lazy" (and decoding="async") to images below the fold.', loc(el)); continue; }
      if (jsLazy(el)) add('lazy-js-library', `${pg.path} ${name}`, `${name} on ${pg.path} is lazy-loaded with ${JS_SRC.find((k) => el.attrs[k] != null)}`, 'Use native loading="lazy" with a real src; it needs no JavaScript and works before scripts run.', loc(el));
      if (isLazy(el) && (el.attrs.width == null || el.attrs.height == null) && !/aspect-ratio/.test(el.attrs.style || '')) add('lazy-no-dimensions', `${pg.path} ${name}`, `Lazy image ${name} on ${pg.path} has no width/height`, 'Set width and height (or CSS aspect-ratio) so the space is reserved before it loads.', loc(el));
    }
    for (const l of pre) { const k = urlKey(l.attrs.href); const m = all.find((x) => x.kind === 'img' && urlKey(srcOf(x.el)) === k && isLazy(x.el)); if (m) add('lazy-preload-conflict', `${pg.path} ${k}`, `${k} is preloaded on ${pg.path} but its <img> is loading="lazy"`, 'Drop loading="lazy" from the image (or drop the preload).', { file: pg.file, line: m.el.line }); }
  }
  return { findings, info: { media, lazy: lazyCount }, summary: `${pages.length} page(s), ${media} image(s)/iframe(s), ${lazyCount} lazy-loaded` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'lazy-pulse', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '💤', defaultFile: 'index.html' };
  const f = opts.foldImages ?? config.foldImages; if (f != null && !(Number.isInteger(Number(f)) && Number(f) >= 0)) throw new UsageError('foldImages must be a non-negative integer');
  return runBeacon(tool, dir, { ...opts, foldImages: f == null ? undefined : Number(f), UsageError }, config, configFile, analyze, buildReport);
}
