#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'lazy-pulse', version: pkg.version, configKey: 'lazyPulse', rules: RULES,
  tagline: 'lazy-loading audit: below-the-fold media without loading=lazy, LCP images wrongly lazy-loaded',
  usage: 'Usage: lazy-pulse [site-dir] [options]',
  help: `${SITE_HELP}Lazy loading
      --fold-images <n>        Content images treated as above the fold, after the LCP candidate (default 1)
`,
  options: { ...SITE_OPTIONS, 'fold-images': { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { cli: o, foldImages: o['fold-images'], toolVersion: pkg.version }, config, configFile),
});
