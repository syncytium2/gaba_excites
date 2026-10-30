# Handoff 2026-10-30: the workstation is Windows (addendum to `2026-10-30-workstation.md`)

**Written by the cloud session "cloud gaba deploy"**, answering the workstation session "gaba-excites-1e" (Windows 11,
Git Bash, Python 3.14), which read `2026-10-30-workstation.md`, found it accurate for macOS and Linux, and listed what
it misses on Windows. Read that handoff first; this one changes only what is below. The owner relays between the two
sessions.

## Line endings: fixed in the repository

The workstation's clone has `core.autocrlf=true`, so `scripts/deploy.sh` and `scripts/classroom.sh` came out with CRLF
and bash would stop at `set -euo pipefail`. Every file is stored with LF (`git ls-files --eol`: all `i/lf` but two
binaries), so the fix is a `.gitattributes` on `main` (`* text=auto eol=lf`, and `eol=lf` for `*.sh`). It changes no
file's content; it only makes every checkout LF, whatever `core.autocrlf` says.

Bring the existing clone into line after pulling it (the files already on disk keep CRLF until checked out again):

```
git pull origin main
git rm -rq --cached . && git reset -q --hard
git ls-files --eol | grep 'w/crlf'      # must print nothing
```

A fresh clone works as well. No second clone with `-c core.autocrlf=false` is needed.

## Tools

- **Node 22**: not installed yet. The owner installs it (nodejs.org's Windows installer puts `node` and `npm` on the
  PATH for both PowerShell and Git Bash). Open a new Git Bash afterwards; `node -v` prints v22.
- **Python**: `classroom.sh` runs `python3`. Check `python3 --version` in Git Bash prints a real version, not the
  Microsoft Store stub. If only `python` exists, tell the owner rather than editing the script.
- Then `npm ci`, `npx playwright-core install chromium`, and the owner runs `npx wrangler login` and `npx wrangler whoami`.

Corrected 2026-10-30: this said `npx playwright install chromium`, which installs the wrong browser build; the
workstation session found it and installed the right one with `npx playwright-core install chromium`.

## Run everything from Git Bash

All the commands in the first handoff are bash. Run them in Git Bash, not PowerShell or cmd. `/tmp`, `&`, `pkill`,
`mktemp` and `curl` all work there. For the screenshot check, stop the preview server with `kill %1` from the same
shell rather than `pkill`.

**The deploy command.** `npm run deploy` is literally `bash scripts/deploy.sh`. On Windows npm runs scripts through
cmd.exe, where `bash` can resolve to WSL's `System32\bash.exe` instead of Git Bash, and then it would run in a
different system with no node and no login. So on this machine, run **`bash scripts/deploy.sh`** (and
`bash scripts/deploy.sh --dry-run`) from Git Bash in the clone. It is the same runbook with the same gates. The rule
in `AGENTS.md` forbids going around the runbook (a hand-run `wrangler deploy`), not this. Do not change npm's
`script-shell`; that is machine-wide configuration, and the owner's to decide.

## Keeping the machine awake

No `caffeinate`. The owner sets sleep to "Never" on mains power for the deploy (Settings, System, Power), or Git Bash
can run `powercfg /change standby-timeout-ac 0` before and `powercfg /change standby-timeout-ac 30` after; ask the
owner before running `powercfg`, because it changes a machine setting.

## Not yet known on Windows

`classroom.sh` makes a temporary `git worktree` under `mktemp -d` and runs `npm ci` and `vite build` in it. That has
never run on Windows. The dry run (`bash scripts/deploy.sh --dry-run`) exercises it without uploading anything or
committing anything, so run it and report before the real deploy. If it fails, report the step and the error; do not
patch `deploy.sh` or `classroom.sh` on this machine.

## The order, on Windows

1. The owner installs Node 22. The session pulls `main` and re-checks the files out as above.
2. `npm ci`, `npx playwright-core install chromium`. The owner runs `npx wrangler login`.
3. The pre-deploy checks of the first handoff, in Git Bash, then `bash scripts/deploy.sh --dry-run`.
4. Report to the owner, who relays to the cloud session. The real deploy waits for his yes.
5. Deploy with `bash scripts/deploy.sh`, then commit `DEPLOYED.md` and push at once, exactly as the first handoff
   says.

## Added after the dry run: the classroom base, fixed in the scripts

The workstation's first dry run found that Git Bash rewrote `classroom.sh`'s `--base /fall-2026/` into a Windows path,
so every asset URL in the classroom page pointed at the Git install folder, and the gates passed anyway because their
grep matched inside the rewritten path. A real deploy would have shipped a blank classroom page and verified it as
good. Fixed on `main` in the scripts, not in how they are run: `classroom.sh` sets `MSYS2_ARG_CONV_EXCL` for the vite
call and refuses a classroom page with any asset URL outside `/fall-2026/`; `deploy.sh`'s gate and its live check
are anchored at `src="`. So the deploy command stays plain `bash scripts/deploy.sh` from Git Bash; no environment
variable is needed. Checked on Linux by a dry run (classroom bundle unchanged, `index-DcdzVBSe.js`) and by feeding
the gates a page with the rewritten paths, which both now refuse and the old gate passed.
