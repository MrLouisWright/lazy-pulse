# lazy-pulse

> Lazy-load what is below the fold, never the LCP image: a static lazy-loading audit for your built site.

Native `loading="lazy"` is one attribute, and it is easy to get wrong in both directions: galleries and embeds below the fold download eagerly, while a template applies `loading="lazy"` (or a `data-src` library) to the hero image and pushes back Largest Contentful Paint. `lazy-pulse` reads your built HTML, picks the likely LCP image on each page, and checks every image and iframe against where it sits in the document.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **LCP candidate:** the image with `fetchpriority="high"`, else a preloaded image, else the first content image (icons, logos in nav/header, tracking pixels and `<noscript>` are skipped).
- **LCP mistakes:** `loading="lazy"` (high), lazy-loaded by JavaScript via `data-src` (high), `fetchpriority="low"` (medium), a `<link rel=preload as=image>` for an image that is lazy (high), and no `fetchpriority` at all (info).
- **Below the fold:** images and iframes without `loading="lazy"` after the first `foldImages` content images (default 1 after the LCP image); iframes (video, maps, widgets) are always expected to be lazy unless allowlisted.
- **Above the fold:** content images near the top that are lazy (low).
- **Hygiene:** lazy images without width/height or aspect-ratio (layout shift), and JS lazy-load libraries where native lazy loading would do.

### Scope

A static heuristic: there is no layout engine, so "the fold" is document order. Tune `foldImages` for your templates and allowlist the exceptions.

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `lazy-lcp-lazy` | high | LCP candidate image has loading="lazy" (delays the largest paint) |
| `lazy-lcp-js` | high | LCP candidate is lazy-loaded by JavaScript (data-src, no real src) |
| `lazy-preload-conflict` | high | Image is preloaded but its <img> has loading="lazy" |
| `lazy-lcp-low-priority` | medium | LCP candidate has fetchpriority="low" |
| `lazy-img-missing` | medium | Below-the-fold image without loading="lazy" |
| `lazy-iframe-missing` | medium | Below-the-fold iframe without loading="lazy" |
| `lazy-above-fold-lazy` | low | Image near the top of the page is lazy-loaded |
| `lazy-no-dimensions` | low | Lazy-loaded image without width/height (layout shift when it loads) |
| `lazy-js-library` | low | JavaScript lazy-loading (data-src) where native loading="lazy" would do |
| `lazy-lcp-no-priority` | info | LCP candidate has no fetchpriority="high" |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx lazy-pulse dist
npx lazy-pulse _site --fold-images 2
npx lazy-pulse public --fail-on medium -f sarif > lazy.sarif
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
lazy-pulse — test/fixtures/bad
1 page(s), 7 image(s)/iframe(s), 4 lazy-loaded

HIGH     index.html:6 LCP candidate hero.jpg on / has loading="lazy" [lazy-lcp-lazy]
HIGH     index.html:6 /img/hero.jpg is preloaded on / but its <img> is loading="lazy" [lazy-preload-conflict]
MEDIUM   index.html:9 Below-the-fold image a.jpg on / has no loading="lazy" [lazy-img-missing]
MEDIUM   index.html:12 Below-the-fold image d.jpg on / has no loading="lazy" [lazy-img-missing]
MEDIUM   index.html:13 iframe https://www.google.com/maps/embed?pb=1 on / is not lazy-loaded [lazy-iframe-missing]
LOW      index.html:7 second.jpg is among the first 1 content images on / but has loading="lazy" [lazy-above-fold-lazy]
LOW      index.html:10 Lazy image team.jpg on / has no width/height [lazy-no-dimensions]
LOW      index.html:11 c.jpg on / is lazy-loaded with data-src [lazy-js-library]

2 high, 3 medium, 3 low
✔ Passing (fail-on: none).
```

## Options

```text
lazy-pulse 1.0.0 — lazy-loading audit: below-the-fold media without loading=lazy, LCP images wrongly lazy-loaded

Usage: lazy-pulse [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Lazy loading
      --fold-images <n>        Content images treated as above the fold, after the LCP candidate (default 1)

Common
  -c, --config <file>     JSON config (default: .lazy-pulse.json or "lazyPulse" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.lazy-pulse.json` (or a `"lazyPulse"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "lazy-lcp-lazy": "low"
  },
  "allowlist": [
    {
      "rule": "lazy-iframe-missing",
      "subject": "/contact/ *",
      "reason": "Map is the main content of the contact page",
      "expires": "2027-03-31"
    }
  ],
  "foldImages": 2
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.lazy-pulse.json` can live at your repository root. Other keys: `foldImages` (content images after the LCP image treated as above the fold, default 1) and `iconSize` (images at or below this many px are icons, default 64).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  lazy-pulse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/lazy-pulse@v1
        with:
          path: dist
          fail-on: high
          sarif: lazy-pulse.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: lazy-pulse.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, parseHtml, mediaOf, lcpCandidate } from "lazy-pulse";
const doc = parseHtml(html);
lcpCandidate(doc, mediaOf(doc))?.el.attrs.src;
check("dist", { foldImages: 2 }).findings;
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
