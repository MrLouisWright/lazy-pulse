# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- LCP candidate detection (fetchpriority="high", preloaded image, else first content image; icons, nav and tracking pixels skipped).
- LCP checks: `loading="lazy"`, JavaScript lazy-loading (`data-src`), `fetchpriority="low"`, preload/lazy conflicts.
- Below-the-fold images and iframes without `loading="lazy"`, with a configurable fold (`foldImages`).
- Lazy images without width/height; JS lazy-load libraries where native lazy loading would do.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
