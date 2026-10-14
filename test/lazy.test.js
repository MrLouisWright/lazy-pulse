import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, runCli, RULES, parseHtml, mediaOf, lcpCandidate } from '../src/index.js';

const ids = (r) => [...new Set(r.findings.map((f) => f.rule))].sort();
const io = () => { const o = { s: '', e: '' }; return { o, io: { stdout: { write: (x) => { o.s += x; } }, stderr: { write: (x) => { o.e += x; } } } }; };
const site = (body, head = '') => { const d = mkdtempSync(join(tmpdir(), 'lz-')); writeFileSync(join(d, 'index.html'), `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`); return d; };
const img = (n, a = '') => `<img src="/i/${n}.jpg" alt="" width="600" height="400" ${a}>`;
const cli = { name: 'lazy-pulse', version: '1.0.0', configKey: 'lazyPulse', rules: RULES, tagline: 't', usage: 'u', help: '', options: {}, run: async ({ dir, config }) => check(dir, {}, config) };

test('good fixture is clean at info', () => assert.deepEqual(ids(check('test/fixtures/good')), []));
test('bad fixture', () => assert.deepEqual(ids(check('test/fixtures/bad')), ['lazy-above-fold-lazy', 'lazy-iframe-missing', 'lazy-img-missing', 'lazy-js-library', 'lazy-lcp-lazy', 'lazy-no-dimensions', 'lazy-preload-conflict']));
test('LCP candidate: fetchpriority > preload > first content image; icons and nav skipped', () => {
  const d1 = parseHtml(`<body><nav><img src="/logo.png" width="200" height="50"></nav>${img('icon', 'width="24"')}${img('a')}${img('b', 'fetchpriority="high"')}</body>`);
  assert.match(lcpCandidate(d1, mediaOf(d1)).el.attrs.src, /b\.jpg/);
  const d2 = parseHtml(`<head><link rel="preload" as="image" href="/i/b.jpg"></head><body>${img('a')}${img('b')}</body>`);
  assert.match(lcpCandidate(d2, mediaOf(d2)).el.attrs.src, /b\.jpg/);
  const d3 = parseHtml(`<body><img src="/x.svg" width="32" height="32">${img('a')}</body>`);
  assert.match(lcpCandidate(d3, mediaOf(d3)).el.attrs.src, /a\.jpg/);
});
test('JS-lazy LCP and low priority', () => {
  assert.deepEqual(ids(check(site('<img data-src="/h.jpg" class="lazyload" alt="" width="1" height="2">'.replace('width="1" height="2"', 'width="900" height="500"')))), ['lazy-lcp-js']);
  assert.deepEqual(ids(check(site(img('h', 'fetchpriority="low"')))), ['lazy-lcp-low-priority']);
  assert.deepEqual(ids(check(site(img('h')))), ['lazy-lcp-no-priority']);
});
test('fold threshold is configurable (CLI and config)', () => {
  const d = site(img('h', 'fetchpriority="high"') + img('a') + img('b') + img('c'));
  assert.deepEqual(ids(check(d)), ['lazy-img-missing']);
  assert.deepEqual(ids(check(d, { foldImages: 3 })), []);
  assert.deepEqual(ids(check(d, {}, { foldImages: 5 })), []);
  assert.throws(() => check(d, { foldImages: 'x' }), /non-negative/);
});
test('tracking pixels and noscript ignored; footer images count as below the fold', () => {
  const d = site(img('h', 'fetchpriority="high"') + '<img src="https://t.example/p.gif" width="1" height="1" alt=""><noscript><img src="/n.jpg"></noscript><footer>' + img('f') + '</footer>');
  assert.deepEqual(ids(check(d)), ['lazy-img-missing']);
});
test('allowlist with expiry and severity override', () => {
  const r = check('test/fixtures/bad', {}, { allowlist: [{ rule: 'lazy-iframe-missing', reason: 'map must load', expires: '2099-01-01' }], severity: { 'lazy-no-dimensions': 'off' } });
  assert.ok(!ids(r).includes('lazy-iframe-missing')); assert.ok(!ids(r).includes('lazy-no-dimensions'));
  assert.ok(ids(check('test/fixtures/bad', {}, { allowlist: [{ rule: 'lazy-iframe-missing', reason: 'x', expires: '2020-01-01' }] })).includes('allowlist-expired'));
});
test('CLI exit codes and formats', async () => {
  let t = io(); assert.equal(await runCli(cli, ['test/fixtures/good', '--fail-on', 'info'], t.io), 0);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'sarif'], t.io), 1); assert.equal(JSON.parse(t.o.s).version, '2.1.0');
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'json', '--fail-on', 'none'], t.io), 0); assert.ok(JSON.parse(t.o.s).findings.length);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'markdown'], t.io), 1); assert.match(t.o.s, /lazy-lcp-lazy/);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/none'], t.io), 2);
});
