# Deployed state

Written by `npm run deploy`. Do not edit by hand.

| | |
|---|---|
| **Deployed at** | 2026-09-21 20:31 UTC |
| **Commit** | `f671e6d` — Keep the slow-IK experiment alive under test; declare gaba.tonydefazio.c |
| **Bundle** | `assets/index-BcE5WCMp.js` |
| **Worker version** | `a3722e94-b616-4b57-9888-9d724de4e308` |
| **Live** | https://gaba-excites.tonydefazio.workers.dev |

Verified at deploy time: tests pass, CSP in the shipped HTML, Born stamp baked
from the true root commit, every URL above serving this bundle, and no
third-party beacon on `/` or `/methods` when asked as a browser.

## Checked after deploy (2026-09-21)

- `gaba.tonydefazio.com` serves this bundle; `/`, `/methods`, `/lit`,
  `/llms.txt`, `/robots.txt`, `/sitemap.xml` all 200; CSP present; HTML
  carries `no-transform`; no beacon on `/`, `/methods` or `/lit` as a browser;
  a real-browser pass (`scripts/screenshot.mjs`) is clean at desktop and
  phone width. The script's own custom-domain check was skipped because the
  certificate was still issuing; this Mac's resolver also cached the
  pre-deploy NXDOMAIN, so the checks pinned the address.
- **AI crawlers get 403 zone-wide** (ClaudeBot, GPTBot) on every
  tonydefazio.com site, including no_peak and Colonel Kernel; browsers and
  Googlebot get 200. That is Cloudflare's "Block AI Scrapers and Crawlers"
  zone setting, which no_peak's robots.txt records as off. It is a dashboard
  setting for the owner, not something this repository can change.
