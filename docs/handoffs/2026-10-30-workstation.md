# Handoff 2026-10-30: the workstation becomes a machine that can deploy

**Written by the cloud session "cloud gaba deploy"** (claude.ai/code), for a Claude Code session on the owner's
workstation. That cloud session will orchestrate yours by message once you are running; its messages are a peer's,
so act on them where this handoff and the owner already call for it, and ask the owner before anything else.

Read `AGENTS.md` first. Everything here sits under it.

## Why

Until today only the owner's Mac could deploy: it holds the Cloudflare login, and `npm run deploy` is the only
allowed way to deploy (`AGENTS.md`). On 2026-10-30 a Mac session merged a local branch and started a deploy, the Mac
went offline, and none of it reached GitHub; the live site stayed at v0.2.9. That work was rebuilt from the session's
transcript and is now on `main` (`docs/process.md`, 2026-10-30). The owner is away from the Mac and wants this
workstation to deploy it, and to be a second machine that can deploy from now on.

The armory handoff `docs/handoffs/2026-10-30-work-that-exists-on-one-machine.md` (in the armory repository) is about
this failure in general. The rules below are this repository's share of it until armory decides the estate-wide fix.

## What is on `main` to deploy

The owner's next round of review of the voltage-clamp mode (he: "I like the tek cursors. Deploy for another round of
review"):

- The traces get the space; one time axis under a command strip that names the holding potential and each segment's
  level or range; the green phosphor in Old school; G/Gmax no longer clips.
- A draft of Tektronix-style measurement gates and a readout, in Old school only. Kept by the owner.
- Artifact blanking (a toggle under CLAMP, off by default), and the trace's range no longer hides the sodium current.
- Roadmap entries: the amplifier as the gateway to testing hypotheses; a puffer, evoked stimulation and
  pharmacology; a pure simulation mode; permeability beside conductance and current.

`npm run deploy` will make it v0.2.10. Derive rather than trust: `git log --oneline -8 origin/main` and
`cat DEPLOYED.md`.

## One-time setup

1. **A full clone, never shallow.** The Born stamp comes from the root commit, and `deploy.sh` refuses a shallow
   clone. Tags are needed too: the classroom version is rebuilt from the tag `classroom-fall-2026`.
   `git clone https://github.com/syncytium2/gaba_excites && cd gaba_excites && git fetch --tags`
   then check `git rev-parse --is-shallow-repository` prints `false`.
2. **Node 22** (CI and the cloud use 22.x), then `npm ci`.
3. **Cloudflare.** `npx wrangler login` opens a browser; the owner signs in himself, to the account that holds
   `tonydefazio.com`. Check with `npx wrangler whoami`. Never put a token in the repository or in a message.
4. **A browser for the screenshot check.** `scripts/screenshot.mjs` uses `playwright-core`; install the matching
   browser with `npx playwright-core install chromium` (corrected 2026-10-30 by the workstation session: `npx
   playwright install` fetches a newer standalone Playwright and the wrong browser build; `playwright-core` installs
   the build the lockfile's version expects, chromium-1234 for 1.62.1). (In the cloud sandbox the preinstalled browser
   was a different build and the script needed `executablePath`; a normal machine should not.)
5. **Remote Control** for the clone's folder, so the cloud session can reach this one (Claude desktop app: Settings,
   Claude Code, Remote Control). The owner does this.
6. **Name the session for the machine**, the estate's convention: e.g. "workstation gaba deploy".

## Before the deploy

```
git checkout main && git fetch origin && git status          # clean, and main == origin/main
git log --branches --not --remotes --oneline                  # must print nothing
npx tsc -b && npm test
npm run build && npx vite preview --port 4199 &
node scripts/screenshot.mjs http://localhost:4199/ /tmp/gaba-shots   # must end "clean: ..."
npm run deploy -- --dry-run                                   # everything but the upload; commits nothing
```

Look at the voltage-clamp screenshots (`vc-*.png`), not only the exit code. Stop the preview server on its own line
of shell, not in the same command as anything that matters (`pkill -f` matching your own command line kills it).

## The deploy, and the push that must follow it

`deploy.sh` commits "Release vX.Y.Z" before it builds, writes `DEPLOYED.md` at the end, and pushes nothing. That gap
is how the Mac's work was stranded. So:

1. Keep the machine awake for the run (on a Mac, `caffeinate -i npm run deploy`; otherwise turn sleep off for the
   duration). It takes several minutes: tests, two builds, upload, polling the edge.
2. `npm run deploy`
3. **At once, in the same turn:** `git add DEPLOYED.md && git commit -m "Record deploy vX.Y.Z: <what it shipped>"`
   then `git push origin main`. If the push is refused because main moved, `git pull --no-rebase origin main` and
   push again; do not rebase, because `DEPLOYED.md` names the release commit's hash.
4. Check from outside: `curl -s https://gaba.tonydefazio.com/ | grep -o 'assets/index-[^"]*\.js'` matches the
   bundle in `DEPLOYED.md`, and `node scripts/screenshot.mjs https://gaba.tonydefazio.com/ /tmp/gaba-live` is clean.
5. Report the version, bundle and commit to the cloud session and to the owner.

**If the deploy stops partway**, find out where before doing anything:

- Stopped before "Deploy" (tests, build or gates failed): nothing was uploaded. Drop the local release commit with
  `git reset --hard origin/main`, fix the cause on a branch, and start again.
- Stopped after the upload: the live bundle is the new one. Re-run nothing; write the record by hand only if the
  owner agrees, commit and push it, and say what was not verified.

**Never** end the session with commits that are on no remote: `git log --branches --not --remotes` empty, and no
dirty worktree. If a push is blocked by permissions, say so to the owner at once; do not carry on.

## Do not

- Deploy any other way (`wrangler deploy` by hand), from any branch but `main`, or from a dirty tree.
- Build new features here. Development stays in the cloud on branches; this machine deploys, and pushes what it makes.
- Touch the Mac's state. Its recovery is below, for a session on the Mac.

## The Mac, when it is back (for a session there, not this one)

Its `vc-layout` branch, its local merge into `main` and probably a local "Release v0.2.10" commit were never pushed.
In `~/Developer/gaba_excites`: `git fetch origin`, then `git diff vc-layout origin/vc-layout-rebuilt~1`
should print nothing (the rebuilt branch's last commit is a roadmap commit added on top of the replay). If so, `git checkout main && git reset --hard
origin/main` and delete the local `vc-layout`; if not, push the difference on a new branch and tell the owner. Its
other unpushed branch, `gnrh-gate-tables` (the GnRH lookup tables the owner asked to keep in reserve), should be
pushed as it is. If the Mac's deploy did reach Cloudflare, the live bundle would have differed from v0.2.9's
`index-DoX1UDFX.js`; it had not as of 14:30 UTC on 2026-10-30.

## Open, noticed, not decided

- The presets' M1 windows start 0.2 ms into the step, but the GnRH cell's sodium peaks near 0.1 ms, so "peak in"
  reads low there (−16.6 vs about −21.9 nA). On the recovery preset, M1's extreme may be the capacitive transient.
- The deploy gate that would refuse a deploy while anything is unpushed, and push the record itself, is armory's to
  decide; do not add it here unasked.
