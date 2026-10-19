# Deployed state

Written by `npm run deploy`. Do not edit by hand.

| | |
|---|---|
| **Deployed at** | 2026-10-19 20:03 UTC |
| **Version** | v0.2.1 |
| **Commit** | `63a3734` — Release v0.2.1 |
| **Bundle** | `assets/index-B9opi8-5.js` |
| **Worker version** | `065e7760-b84b-489e-89d0-0de3a1e3d770` |
| **Live** | https://gaba-excites.tonydefazio.workers.dev https://gaba.tonydefazio.com |
| **Classroom version** | `/fall-2026/`, built from tag `classroom-fall-2026` (`/fall-2026/assets/index-DcdzVBSe.js`) |

Verified at deploy time: tests pass, CSP in the shipped HTML, Born stamp baked
from the true root commit, every URL above serving this bundle, and no
third-party beacon on `/` or `/methods` when asked as a browser.

This record was written by hand: the script stopped at its `/fall-2026/` check,
which ran before the edge dropped a cached 404 for the new path. Checked by
hand right after: both URLs serve `/fall-2026/` with its banner and bundle, and
the main bundle carries v0.2.1. The check now retries like the bundle check.
