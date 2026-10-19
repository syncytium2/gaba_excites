#!/usr/bin/env bash
#
# Build the classroom version into dist/fall-2026/: the site exactly as the
# UM Physiol 578 students used it for the excitability homework (due
# 2026-09-28). Its code is never edited. It is rebuilt from the
# classroom-fall-2026 tag, and the only thing added is a banner, injected into
# its index.html, that says what it is and links back to the current version.
#
#   bash scripts/classroom.sh        # after `npm run build`; deploy.sh runs it
set -euo pipefail

TAG="classroom-fall-2026"
BASE="/fall-2026/"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist/fall-2026"
[[ -d "$ROOT/dist" ]] || { echo "classroom.sh: build the current version first (dist/ missing)" >&2; exit 1; }
git -C "$ROOT" rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "classroom.sh: tag $TAG missing; git fetch --tags" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$TMP/src" 2>/dev/null || true; rm -rf "$TMP"' EXIT
git -C "$ROOT" worktree add -q --detach "$TMP/src" "$TAG"
(cd "$TMP/src" && npm ci --silent >/dev/null && npx vite build --base "$BASE" --outDir "$OUT" --emptyOutDir --logLevel warn)

# Site-wide files belong to the current version at the root, not to this copy.
rm -f "$OUT/_headers" "$OUT/robots.txt" "$OUT/sitemap.xml" "$OUT/llms.txt"

# The banner. Inline styles are allowed by the CSP (style-src 'unsafe-inline');
# no script is added.
BANNER='<div role="note" style="background:#fff4d6;border-bottom:1px solid #d9b44a;color:#3d3000;font:14px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center">This is gaba_excites as UM Physiol 578 used it in fall 2026 (deployed 23 Sep 2026), kept unchanged. Its Methods and Sources links open the current pages. <a href="/" style="color:#1a4fa0">Back to the current version</a></div>'
python3 - "$OUT/index.html" "$BANNER" <<'PY'
import re, sys
p, banner = sys.argv[1], sys.argv[2]
s = open(p).read()
s, n = re.subn(r"<body([^>]*)>", lambda m: m.group(0) + banner, s, count=1)
assert n == 1, "no <body> in the classroom index.html"
open(p, "w").write(s)
PY
echo "  classroom version built from $TAG into dist/fall-2026/"
