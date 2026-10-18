#!/usr/bin/env python3
# vendored from syncytium2/armory @ 1646eb7. This file is a COPY; edits here are
# overwritten whenever it is re-vendored. Its source repository is private, so there is
# nowhere to send a patch: treat this file as read-only and raise anything you find as
# an issue in THIS repository.
"""show — put a file where the human will actually see it, and say where it went.

THE FAILURE THIS EXISTS TO END
------------------------------
The agent file-send channel does not reach the user in the VS Code extension, and it
**returns success anyway**. Measured in this repo on 2026-09-01: `display=render` with an
SVG and `display=attach` with plain text were both sent, both returned
`1 file delivered to user.`, and neither produced anything on screen. Upstream:
anthropics/claude-code#76739 — open, `has repro`, labelled macos + windows + vscode, no
maintainer response, filed at CLI 2.1.207 and still failing at extension 2.1.252.

That is the estate's "can the alarm ring?" family: a check that reports success while
doing nothing. One session narrated **six** figures as seen across a long working
session; the user only found out by opening a deployed site himself. The session
briefing gate — *"a visual finding? render the figure and show it"* — was satisfied every
time by a call that did nothing, so nothing failed anywhere in that loop.

WHY A PATH AND NOT A FILE
-------------------------
The fix is not a better pipe. It is an artefact that persists somewhere the user already
looks, plus **the absolute path printed as text**. `open` returning 0 proves the launcher
started, exactly as little as `1 file delivered` proved. The difference is that the file
is still there afterwards, so "I showed you X" is a claim the user can contradict. A
gate resting on this one is falsifiable; a gate resting on the send channel is not.

Never say a figure was shown on the strength of a call returning success. Print the path.

THIS FILE IS VENDORED. EDITING IT IS AN ESTATE EDIT, NOT A REPO EDIT
--------------------------------------------------------------------
Copies of this file are installed in other repositories, each stamped with the commit it
was taken at. That stamp covers the consumer direction only. The reverse is not written
anywhere and is the one that bites: **changing this original does not update them.** They
are pins. Re-vendoring is a separate decision, and it belongs to whoever is running the
vendor pass rather than to whoever edits this file.

A pin can also be stranded rather than merely stale — pushed to a consumer on a branch that
was never merged, so the copy exists in the repository and not in anyone's working tree.
Do not infer from an index that a consumer HAS this file; check the consumer.

WHERE IT GOES
-------------
`<review root>/<project>/`, one folder per project, resolved at runtime — by default a
Dropbox folder the maintainer's machines already sync, or anywhere `ARMORY_DARKROOM`
points. The rule it exists to keep: **never write a figure to a scratch or temp path,
because a human has to find it.** A path under /tmp satisfies the code and not the reader.

THE ROOT IS RESOLVED, NEVER SPELLED
-----------------------------------
`dropbox_member_root()` reads Dropbox's own `info.json`, which names the real local path,
so the macOS cloud-mount-vs-symlink distinction never has to be reasoned about and Windows
needs no second branch. Business account first — that is the one holding the review folder.

⚠ This matters beyond convenience: **the member folder contains the user's name.** Every
file that has ever leaked a personal path here did it the same way — by spelling that root
out from `Path.home()` plus literal folder names instead of asking the system where it is.
One such file was deleted from its own repository for exactly that.

The literals are therefore not quoted anywhere in this file, and `--selftest` asserts it by
checking this source against the root it resolved at runtime — so the check needs no copy
of the name in order to look for one. That assertion went red on its first run, against a
docstring that had spelled the folder out while explaining not to.

So: resolve at runtime, hold it in memory, print it to the terminal, and write it to no
file. This module records the path nowhere.

USAGE
-----
    tools/show.py FIG.png                  copy to the review folder, open in the viewer
    tools/show.py FIG.png --code           open as a tab in VS Code instead
    tools/show.py FIG.png --no-open        place it and print the path, open nothing
    tools/show.py A.png B.pdf              several at once
    tools/show.py --where                  print the review folder for this project
    tools/show.py --selftest               prove the resolver and the copy work

    --project NAME    override the project folder (default: the git repo's name). One path
                      component; an empty or dotted name is refused rather than resolved to
                      the darkroom root.
    ARMORY_DARKROOM   the review folder to copy into. Set this on any machine that has
                      no Dropbox install for the tool to read a default from.

EXIT STATUS
-----------
0 only if every file was placed. A failed *opener* is reported but does not fail the run:
the file is placed and the path is printed, which is the delivery that matters.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# --- the resolver ---------------------------------------------------------------


def _info_json_candidates() -> list[Path]:
    home = Path.home()
    out = [home / ".dropbox" / "info.json"]
    for var in ("APPDATA", "LOCALAPPDATA"):
        base = os.environ.get(var)
        if base:
            out.append(Path(base) / "Dropbox" / "info.json")
    return out


def dropbox_member_root() -> Path | None:
    """The member folder, read from Dropbox's own info.json rather than guessed.

    Authoritative and OS-independent in content: it names the real local path, so the
    macOS symlink-vs-cloud-mount distinction never has to be reasoned about here.
    Prefers the business/team account, which is the one holding darkroom.
    """
    for info in _info_json_candidates():
        try:
            blob = json.loads(info.read_text(encoding="utf-8"))
        except Exception:
            continue
        for key in ("business", "personal"):
            path = (blob.get(key) or {}).get("path")
            if path and Path(path).is_dir():
                return Path(path)
    return None


def project_name(override: str | None = None) -> str:
    """The repo this is running in. Derived, so a consumer vendors this file unchanged.

    session-start.sh is self-configuring for the same reason and is the model here: a
    tool that must be edited per repo is a tool that drifts per repo.
    """
    if override is not None:
        return project_component(override)      # passed and empty is an error, not a default
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True, timeout=10)
        if top.returncode == 0 and top.stdout.strip():
            return Path(top.stdout.strip()).name
    except Exception:
        pass
    return Path.cwd().name


def project_component(project: str) -> str:
    """A project folder name, or refuse. `<root>/<name>` has to land *inside* the root.

    `Path(root) / ""` and `/ "."` are both the root itself, and an absolute name discards
    the root entirely — so a name that is not one path component silently redirects the
    write, and `--where` prints the redirected path as though it were a project folder.

    Measured on 2026-09-17, before this guard existed, with `--where`:

        --project .     <member>/darkroom          the darkroom root itself, where the
                                                   maintainer's own top-level documents are
        --project ..    <member>/darkroom/..       the member folder — outside the darkroom
                                                   altogether, and it is the folder whose
                                                   name is the maintainer's
        --project ''    <darkroom>/<derived>       swallowed: `if override:` read the empty
                                                   string as "not given" and derived instead

    All three exited 0 and printed a confident path. The live caller is the handoff recipe
    `mv <entry> "$(show.py --where --project <repo>)/"`, which hands this whatever a shell
    variable expanded to. An empty one is now refused rather than quietly redirected to the
    cwd's repo — in a worktree that was the branch slug, not the repo anyone meant.

    Same family as the send channel this tool exists to replace: a step that reports success
    while putting the artefact where nobody is looking.

    Checked on the parts rather than by string-matching separators, so it holds on Windows
    (`C:x` is two parts there) without a second branch.

    This is the only guard, and deliberately. It first had a second one in `darkroom()`
    asserting the effect — that `<root>/<name>` is a direct child of the root — and
    mutation_check scored that row MISSED: with the parts check in front of it, no input can
    reach it, so disabling it changed nothing and the selftest stayed green. An assertion
    that cannot go red is decoration, and this repo does not keep decoration. One chokepoint,
    one mutation row, covered.
    """
    parts = Path(project).parts
    if len(parts) != 1 or parts[0] == "..":
        raise SystemExit(
            f"show: {project!r} is not a project folder name.\n"
            "  It must be exactly one path component — not empty, not . or .., no separator,\n"
            "  not absolute. Names like that resolve to the darkroom root or outside it,\n"
            "  which is how a deliverable ends up somewhere nobody is looking.\n"
            "  Pass --project NAME, or run from the repo and let it be derived."
        )
    return project


def darkroom(project: str, create: bool = True) -> Path:
    """`<dropbox>/darkroom/<project>` — where things meant to be looked at go.

    One folder per project, so two projects sharing a checkout cannot overwrite
    each other's output.
    """
    override = os.environ.get("ARMORY_DARKROOM")
    if override:
        root = Path(os.path.expandvars(os.path.expanduser(override)))
    else:
        member = dropbox_member_root()
        if member is None:
            raise SystemExit(
                "show: no review folder configured.\n"
                f"  looked in: {', '.join(str(p) for p in _info_json_candidates())}\n"
                "  Set ARMORY_DARKROOM to any directory you can open, e.g.\n"
                "    ARMORY_DARKROOM=~/review\n"
                "  (No Dropbox install was found for the tool to read a default from.)"
            )
        root = member / "darkroom"
    p = root / project_component(project)
    if create:
        p.mkdir(parents=True, exist_ok=True)
    return p


# --- the opener ---------------------------------------------------------------


def open_with(path: Path, code: bool = False) -> tuple[bool, str]:
    """Hand the file to a viewer. Returns (launched, how) — NOT (seen, how).

    The distinction is the whole point of this module. Nothing here can confirm the
    user saw anything; only the printed path lets them tell us we are wrong.
    """
    system = platform.system()
    if code:
        exe = shutil.which("code")
        if exe:
            cmd = [exe, "-r", str(path)]
        elif system == "Darwin":
            cmd = ["open", "-a", "Visual Studio Code", str(path)]
        else:
            return False, "no `code` on PATH"
    elif system == "Darwin":
        cmd = ["open", str(path)]
    elif system == "Windows":
        try:
            os.startfile(str(path))  # type: ignore[attr-defined]
            return True, "startfile"
        except Exception as exc:
            return False, f"startfile failed: {exc}"
    else:
        exe = shutil.which("xdg-open")
        if not exe:
            return False, "no xdg-open on PATH"
        cmd = [exe, str(path)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except Exception as exc:
        return False, f"{cmd[0]} failed: {exc}"
    if r.returncode != 0:
        return False, f"{cmd[0]} exited {r.returncode}: {r.stderr.strip()[:200]}"
    return True, cmd[0]


# --- selftest -----------------------------------------------------------------


def leaked_components(source: str, root: Path | None) -> list[str]:
    """Components of `root` that appear verbatim in `source`.

    The leak check carries no copy of the name it hunts for: it asks the root it just
    resolved what it is made of, and looks for those. `Users`/`home` are every machine's,
    and short components collide with ordinary words, so both are excluded.
    """
    if root is None:
        return []
    return sorted({part for part in root.parts
                   if len(part) > 3 and part not in ("Users", "home") and part in source})


def _write_info_json(home: Path, business: str | None, personal: str | None) -> None:
    """Plant a Dropbox info.json under a fake HOME, in Dropbox's own schema."""
    blob = {}
    if business is not None:
        blob["business"] = {"path": business, "is_team": True}
    if personal is not None:
        blob["personal"] = {"path": personal}
    d = home / ".dropbox"
    d.mkdir(parents=True, exist_ok=True)
    (d / "info.json").write_text(json.dumps(blob), encoding="utf-8")


def selftest() -> int:
    """Prove the resolver, the placement and the leak check — on any machine.

    RUNS WITHOUT DROPBOX, ON PURPOSE. The first version of this selftest asserted against
    the real Dropbox root, so it could not run on a CI runner — and this tool is vendored
    to eleven repositories. An instrument whose test only runs on one laptop is tier 0
    wearing a tier 2 badge. Every check below builds its own fixture in a temp directory,
    touches no network, and needs no Dropbox install.

    It also used to print `OK`/`FAILED`. mutation_check.sh reduces the last line to
    PASS/FAIL, `OK` matched neither, and a row aimed here would have scored ERROR
    baseline-not-green — the tool could not have been mutation-checked at all. It prints
    the contract now.

    mutation_check's rule: a selftest that cannot go red is decoration. Each check asserts
    behaviour, never that this file contains a string.

    AND IT MUST SAY RED RATHER THAN DIE. Found by mutation on 2026-09-02: deleting the
    `mkdir` in darkroom() made this selftest raise partway through, so it printed no verdict
    at all and mutation_check read a stray `ok` line as the result — scoring MISSED for a
    mutation that had in fact broken the tool completely. A crash is a failure and must be
    reported as one, or the suite quietly stops covering exactly the breakages that are
    severe enough to throw.
    """
    import tempfile

    bad: list[str] = []

    def check(label: str, cond: bool, detail: str = "") -> None:
        if not cond:
            bad.append(label)
        print(f"  {'ok  ' if cond else 'RED '} {label}{'  ' + detail if detail else ''}")

    print("show --selftest")
    home_before = os.environ.get("HOME")
    dk_before = os.environ.get("ARMORY_DARKROOM")

    with tempfile.TemporaryDirectory() as td:
        T = Path(td)
        fake_home = T / "home"
        biz = T / "biz-member"
        per = T / "per-member"
        for d in (fake_home, biz, per):
            d.mkdir(parents=True)

        try:
          try:
            os.environ["HOME"] = str(fake_home)
            os.environ.pop("ARMORY_DARKROOM", None)

            _write_info_json(fake_home, str(biz), str(per))
            check("resolves the member root from info.json", dropbox_member_root() == biz)

            # Both accounts present and both real: the business one holds darkroom.
            check("prefers the business account over the personal one",
                  dropbox_member_root() == biz)

            # A path Dropbox names but that is not on this disk must not be returned:
            # that is the difference between reading info.json and trusting it.
            _write_info_json(fake_home, str(T / "does-not-exist"), str(per))
            check("skips an account whose path is not on disk",
                  dropbox_member_root() == per)

            _write_info_json(fake_home, str(biz), None)
            check("works with only a business account", dropbox_member_root() == biz)

            (fake_home / ".dropbox" / "info.json").unlink()
            check("returns None when Dropbox is not installed",
                  dropbox_member_root() is None)

            # darkroom(): the override, and the derived form.
            os.environ["ARMORY_DARKROOM"] = str(T / "override")
            check("ARMORY_DARKROOM overrides the resolved root",
                  darkroom("proj") == T / "override" / "proj")
            os.environ.pop("ARMORY_DARKROOM")

            _write_info_json(fake_home, str(biz), None)
            check("derives <member>/darkroom/<project>",
                  darkroom("proj") == biz / "darkroom" / "proj")
            check("creates the project folder", (biz / "darkroom" / "proj").is_dir())

            # A project name that is not a name must be REFUSED, not resolved. Every one of
            # these used to resolve: the first two to the darkroom root itself, the rest to
            # somewhere outside it. All of them printed a confident path and exited 0.
            os.environ["ARMORY_DARKROOM"] = str(T / "guard")
            for name in ("", ".", "..", "sub/dir", str(T / "elsewhere")):
                label = f"refuses a project name that is not one component: {name!r}"
                try:
                    got = darkroom(name)
                    check(label, False, f"resolved to {got}")
                except SystemExit:
                    check(label, True)
            check("a refused name creates nothing", not (T / "guard").exists())
            check("an ordinary name still resolves and is created",
                  darkroom("ok-name") == T / "guard" / "ok-name"
                  and (T / "guard" / "ok-name").is_dir())
            os.environ.pop("ARMORY_DARKROOM")

            # Without a root and without an override there is no safe guess to make.
            (fake_home / ".dropbox" / "info.json").unlink()
            try:
                darkroom("proj")
                check("refuses to guess a root when none can be resolved", False)
            except SystemExit:
                check("refuses to guess a root when none can be resolved", True)

            # project_name(): derived from the git toplevel, so a consumer vendors this
            # file unchanged rather than editing a constant per repo.
            repo = T / "a-repo-name"
            (repo / "sub").mkdir(parents=True)
            for cmd in (["init", "-q"], ["config", "user.email", "s@e.invalid"],
                        ["config", "user.name", "s"]):
                subprocess.run(["git", "-C", str(repo), *cmd], capture_output=True)
            cwd_before = Path.cwd()
            try:
                os.chdir(repo / "sub")
                check("project name comes from the git toplevel, not the cwd",
                      project_name() == "a-repo-name")
                check("an explicit --project wins", project_name("other") == "other")
            finally:
                os.chdir(cwd_before)

            # Placement: the file lands, and THE PATH IS PRINTED. The printed path is the
            # delivery — a run that places the file silently has delivered nothing.
            os.environ["ARMORY_DARKROOM"] = str(T / "out")
            src = T / "fig.png"
            src.write_bytes(b"\x89PNG\r\n\x1a\n")
            import io
            from contextlib import redirect_stdout
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = main([str(src), "--no-open", "--project", "proj"])
            printed = buf.getvalue().strip()
            dest = T / "out" / "proj" / "fig.png"
            check("places the file in the darkroom", rc == 0 and dest.is_file())
            check("copies the bytes intact", dest.read_bytes() == src.read_bytes())
            check("prints the absolute path it wrote", printed == str(dest))

            # A file that is not there must fail, not be reported as delivered.
            from contextlib import redirect_stderr
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                rc_missing = main([str(T / "nope.png"), "--no-open", "--project", "proj"])
            check("a missing input is a failure, not a delivery", rc_missing == 1)
            os.environ.pop("ARMORY_DARKROOM")

            # The leak check itself must be shown to detect something, or "clean" is
            # unearned. Plant a component and require it to be found.
            planted = T / "Zq7-Member-Name"
            check("the leak check finds a planted path component",
                  leaked_components("root = Zq7-Member-Name/x", planted)
                  == ["Zq7-Member-Name"])
            check("the leak check ignores components not present",
                  leaked_components("nothing here", planted) == [])
          except Exception as exc:
            check("ran to the end without raising", False, f"{type(exc).__name__}: {exc}")
        finally:
            if home_before is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = home_before
            if dk_before is None:
                os.environ.pop("ARMORY_DARKROOM", None)
            else:
                os.environ["ARMORY_DARKROOM"] = dk_before

    # And this source, against the real root when there is one. On a runner there is not,
    # and the planted-component check above is what carries the claim there.
    real = dropbox_member_root()
    source = Path(__file__).resolve().read_text(encoding="utf-8")
    leaked = leaked_components(source, real)
    check("this source records no component of the resolved personal path",
          not leaked,
          f"leaked: {leaked}" if leaked else ("(no Dropbox here — fixture check covers it)"
                                              if real is None else ""))

    print("selftest:", "PASS" if not bad else "RED")
    return 0 if not bad else 1


# --- main ---------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="show",
        description="Put a file in the darkroom, open it, and print where it went.")
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--code", action="store_true", help="open as a tab in VS Code")
    ap.add_argument("--no-open", action="store_true", help="place and print, open nothing")
    ap.add_argument("--project", default=None, help="override the project folder name")
    ap.add_argument("--where", action="store_true", help="print the darkroom dir and exit")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)

    if a.selftest:
        return selftest()

    proj = project_name(a.project)

    if a.where:
        print(darkroom(proj))
        return 0

    if not a.files:
        ap.error("nothing to show (pass one or more files, or --where / --selftest)")

    dk = darkroom(proj)
    failed = 0
    for src in a.files:
        if not src.is_file():
            print(f"show: not a file: {src}", file=sys.stderr)
            failed += 1
            continue
        dest = dk / src.name
        shutil.copy2(src, dest)
        print(dest)                                   # the delivery. always printed.
        if not a.no_open:
            launched, how = open_with(dest, code=a.code)
            if not launched:
                # Not fatal: the file is placed and the path is printed, which is the
                # part the user can act on. Say so rather than implying it was seen.
                print(f"  (could not launch a viewer — {how}; open the path above)",
                      file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
