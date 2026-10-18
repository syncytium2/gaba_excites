#!/usr/bin/env python3
# instrument: verification
# vendored from syncytium2/armory @ 1646eb7. This file is a COPY; edits here are
# overwritten whenever it is re-vendored. Its source repository is private, so there is
# nowhere to send a patch: treat this file as read-only and raise anything you find as
# an issue in THIS repository.
"""PostToolUse gate. A file sent to the user is answered with the fact that it arrived nowhere.

WHY THIS EXISTS
    `SendUserFile` does not deliver in the VS Code extension, and it RETURNS SUCCESS ANYWAY.
    Probed directly 2026-09-01: `display=render` with an SVG and `display=attach` with plain
    text were both sent, both returned "1 file delivered to user.", and neither produced a
    card or an inline preview. Upstream anthropics/claude-code#76739 -- open, `has repro`,
    labelled macos + windows + vscode, filed at CLI 2.1.207, still failing at 2.1.252.

    The failure is undetectable from inside the session, so every convention resting on the
    channel is unfalsifiable. The session briefing's rule -- "a visual finding? render the
    figure and show it" -- was satisfied every time by a call that did nothing. One
    session narrated SIX figures as shown across a working day; the user found out by
    opening a deployed site himself.

WHY A HOOK AND NOT A LINE IN A DOC. It is also written down, in a register of failures
whose checks could not have fired. Written down, it has to be REMEMBERED -- by a session
that does not know the channel is broken, which is every session that has not yet been
bitten. A rule that must be recalled at the moment of use is not a control; a rule that
fires by itself is. This is the half that fires.

WHY PostToolUse AND NOT PreToolUse. The same argument an empty-search gate makes: the
call itself is not a mistake. Sending a file is a reasonable thing to do, and on a client
where the channel works it is the right thing. The mistake happens one step later, when the
success return is read as delivery. So the trigger is the CALL HAVING HAPPENED, not the
arguments -- and unlike a blocking gate this costs a session nothing it can lose.

IT ANSWERS, IT DOES NOT ONLY WARN. A hook saying "that may not have arrived" leaves the
session where it was. This one names the remedy: tools/show.py, located from this file's own
path, with the exact command including the file that was just sent.

WHAT IT DOES NOT KNOW. The payload carries no client identity, so this hook CANNOT tell
whether the session is attached to the VS Code extension (where delivery is confirmed
broken) or a terminal (where it may work). It therefore does not claim the send failed. It
states what is confirmed, and points at a delivery that is verifiable on every client --
which is better than a working send regardless, because a printed path is a claim the user
can contradict and a success return is not.

THIS FILE IS VENDORED. EDITING IT IS AN ESTATE EDIT, NOT A REPO EDIT.
Copies of this file are installed in other repositories, each stamped with the commit it
was taken at. That stamp covers the consumer direction only: **changing this original does
not update them.** They are pins, and re-vendoring is a separate decision. A pin can also be
stranded rather than stale -- pushed to a consumer on a branch nobody merged -- so do not
infer from an index that a consumer HAS this gate. Check the consumer.

RETIRING IT. Retire a probe in the same commit that retires its
subject. When #76739 closes and delivery is confirmed on this machine, delete this file and
the register entry together -- a gate that fires about a fixed bug is noise, and noise is how
an alarm stops being read.

SELF-CONFIGURING. show.py is located from this file's own path, so this hook and tools/show.py
can be copied into any repo unchanged.

EXIT  0 always. This gate never blocks.
      python3 .claude/hooks/send-goes-nowhere.py --selftest   to check it still fires.
"""
import json
import shlex
import sys
from pathlib import Path

SHOW = Path(__file__).resolve().parents[2] / "tools" / "show.py"

# The tool names that mean "hand this artefact to the user". Kept as a set rather than one
# literal because the estate has seen this surface under more than one name; an unknown
# tool must never be matched, or the gate becomes the noise it is meant to prevent.
SEND_TOOLS = {"SendUserFile"}


def _paths(tool_input):
    """Whatever this call was trying to deliver, for naming it back in the remedy."""
    # ONE KEY, AND IT IS ALWAYS A LIST. SendUserFile's schema: `files` (array, minItems 1,
    # required), plus caption/display/status which name no file. This used to check five
    # key names -- `file_path`, `path`, `file`, `paths` were invented, and since `files` is
    # an array the string branch they fed was unreachable as well.
    #
    # THAT DEAD BRANCH WAS NOT HARMLESS. A mutation aimed at it read as CAUGHT for as long
    # as the selftest's fixtures were fake, so the gate reported confidence about code no
    # real input could reach. When the fixtures were corrected the row went MISSED, and the
    # first response here was to retarget it at the live branch -- repairing the gate to
    # green instead of reading what it had just said. draughtsman-c9: a missed mutation
    # after a fixture fix is a FINDING, not a repair. The finding was that this branch was
    # dead. So it is gone rather than worked around.
    #
    # If the schema ever grows a second shape, `files` stops matching and the remedy falls
    # back to "<file>" -- degraded and legible, never a crash. There is a fixture for that.
    v = tool_input.get("files")
    out = [str(x).strip() for x in v if str(x).strip()] if isinstance(v, list) else []
    seen, uniq = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq[:4]


def run(payload):
    """Returns the additionalContext string, or '' to stay silent."""
    if payload.get("tool_name", "") not in SEND_TOOLS:
        return ""

    files = _paths(payload.get("tool_input", {}) or {})
    show_here = SHOW.is_file()

    if files:
        # SHELL-QUOTE EVERY PATH, ALWAYS. This used to quote only paths containing a
        # space, which is the defect colonel-kernel-45 raised for the estate on
        # 2026-09-06: a recipe tested where its author stands rather than where its reader
        # stands. A path with `!` in it was emitted bare, and in INTERACTIVE zsh -- the
        # user's shell -- `!` is history expansion, so the remedy died at parse time with
        # `zsh: event not found` before running a line. It worked in every non-interactive
        # test because history expansion is off there. shlex.quote uses single quotes,
        # which suppress it.
        arg = " ".join(shlex.quote(f) for f in files)
        remedy = ("python3 %s %s" % (SHOW, arg)) if show_here else \
                 ("copy %s into <dropbox>/darkroom/<project>/ and print the absolute path"
                  % arg)
    else:
        remedy = ("python3 %s <file>" % SHOW) if show_here else \
                 "copy the file into <dropbox>/darkroom/<project>/ and print the absolute path"

    lines = [
        "THAT SEND MAY HAVE REACHED NOBODY, AND ITS RETURN VALUE CANNOT TELL YOU.",
        "",
        "SendUserFile does not deliver in the VS Code extension and returns success anyway.",
        "Probed 2026-09-01: display=render (SVG) and display=attach (text) both returned",
        '"1 file delivered to user." and neither appeared on screen. Upstream',
        "anthropics/claude-code#76739 -- open, has repro, macos + windows + vscode.",
        "",
        "This hook cannot see which client is attached, so it is not claiming your call",
        "failed. It is telling you the success you just got is not evidence that it worked.",
        "",
        "DELIVER IT A WAY THE USER CAN CONTRADICT:",
        "    " + remedy,
        "",
        "That copies the file into a review folder that persists, and prints its absolute",
        "path. Put that path in your reply. If no review folder is configured here, set",
        "ARMORY_DARKROOM to any directory you can open -- WHERE it lands does not matter,",
        "only that the artefact outlives the call and you can name it. `open`",
        "returning 0 proves only that a launcher started, exactly as little as",
        '"1 file delivered" proved; the difference is the artefact is still there afterwards.',
        "",
        "NEVER report a figure as shown on the strength of a call that returned success.",
    ]
    return "\n".join(lines)


def selftest():
    bad = []

    def check(cond, why):
        if not cond:
            bad.append(why)
        print("  %s  %s" % ("ok " if cond else "FAIL", why))

    # A MUTATION THAT CRASHES THE TOOL MUST STILL READ AS RED. Without this wrapper an
    # exception raised partway through prints no verdict line at all -- and mutation_check's
    # verdict() reads the LAST line, so the run scores as neither PASS nor FAIL and a tool
    # broken outright is reported as MISSED: as a gap in this selftest rather than as the
    # break it actually is. Hit first in show.py's fixtures; confirmed here by
    # crashing run() on purpose, where this selftest printed nothing whatsoever.
    try:
        # THE REAL PAYLOAD SHAPE. Every fixture here used to be `file_path` or `paths`,
        # and NEITHER IS A KEY SendUserFile HAS. The tool passed anyway because `files`
        # sat in a speculative list -- so this selftest was green on inputs that cannot
        # occur, and the four mutation rows aimed at it proved nothing about the only
        # input that can. draughtsman-c9, 2026-09-03: "a fixture drawn from the only
        # producer you have is not a fixture, it is a mirror." This was not even that --
        # it mirrored a guess about a schema that was readable the whole time.
        fired = run({"hook_event_name": "PostToolUse", "tool_name": "SendUserFile",
                     "tool_input": {"files": ["/tmp/fig.png"], "status": "normal"},
                     "tool_response": "1 file delivered to user."})
        check(bool(fired), "fires on a REAL payload (files: [...], the only shape there is)")
        check("/tmp/fig.png" in fired, "names the sent file in the remedy, read from `files`")
        multi = run({"tool_name": "SendUserFile",
                     "tool_input": {"files": ["/tmp/a b.png", "/tmp/c.pdf"],
                                    "caption": "before vs after", "status": "proactive"}})
        check("'/tmp/a b.png'" in multi and "/tmp/c.pdf" in multi,
              "real multi-file send: carries every file, shell-quotes the spaced one")
        # EVERY FIELD THE SCHEMA HAS, populated at once. `display` was covered by no
        # fixture until colonel-kernel-80 read the tool definition independently and said
        # so -- the second-producer rule working in the direction it is supposed to.
        # Asserted with SENTINELS, not with the field values: a first attempt tested for
        # the word "render", which appears in this file's own fixed prose describing the
        # 2026-09-01 probe, so the check passed on the docstring rather than on behaviour.
        full = run({"tool_name": "SendUserFile",
                    "tool_input": {"files": ["/tmp/x.png"], "status": "proactive",
                                   "display": "render", "caption": "ZZCAPTIONZZ"},
                    "tool_response": "1 file delivered to user."})
        check("/tmp/x.png" in full, "full schema payload: still names the file")
        # A REMEDY THAT DIES AT PARSE TIME IS NOT A REMEDY. `!` is history expansion in
        # interactive zsh; a bare path containing one fails with `event not found` before
        # running. Asserted on the emitted text, because that is what a human pastes.
        bang = run({"tool_name": "SendUserFile",
                    "tool_input": {"files": ["/tmp/weird!name.png", "/tmp/a b.png"]}})
        cmd = [l for l in bang.splitlines() if "show.py" in l][0]
        check("'/tmp/weird!name.png'" in cmd,
              "a `!` path is shell-quoted -- bare, interactive zsh refuses to parse it")
        check("'/tmp/a b.png'" in cmd, "a spaced path is shell-quoted too")
        check("ZZCAPTIONZZ" not in full,
              "full schema payload: caption is not echoed into the remedy")
        check(all(run({"tool_name": "SendUserFile",
                       "tool_input": {"files": ["/tmp/x.png"], "display": d}})
                  for d in ("render", "attach")),
              "fires on both `display` values -- neither suppresses the gate")
        # If the schema ever grows a shape `files` does not match, the remedy must
        # DEGRADE, not crash -- the hook is PostToolUse and a traceback there is worse
        # than the silence it replaces.
        for odd in ({"files": "/tmp/one.png"}, {"files": None}, {"nope": "/tmp/x"}):
            r = run({"tool_name": "SendUserFile", "tool_input": odd})
            check(bool(r) and "<file>" in r,
                  "unrecognised payload %-22s -> degrades to a runnable remedy"
                  % (list(odd.items())[0][1] if odd else "",))
        check("76739" in fired, "cites the upstream issue")
        check("not claiming your call" in fired, "does NOT assert the send failed -- it cannot know")

        # The success return is the whole defect, so a successful response must not silence it.
        check(bool(run({"tool_name": "SendUserFile", "tool_input": {},
                        "tool_response": "1 file delivered to user."})),
              "a SUCCESSFUL response does not silence it -- success is the defect")

        # And it must be able to stay quiet, or it is noise on every tool call.
        for tool in ("Write", "Bash", "Read", "Grep"):
            if run({"tool_name": tool, "tool_input": {"files": ["/tmp/fig.png"]}}):
                bad.append("stayed silent on %s" % tool)
        check(not any(b.startswith("stayed silent") for b in bad),
              "silent on every other tool")

        check(not run({"tool_name": "", "tool_input": {}}), "silent on a malformed payload")

        # Multi-file and unnamed calls must both produce a usable command.
        multi = run({"tool_name": "SendUserFile",
                     "tool_input": {"files": ["/tmp/a b.png", "/tmp/c.pdf"]}})
        check("'/tmp/a b.png'" in multi and "/tmp/c.pdf" in multi,
              "shell-quotes a path containing a space, and carries every file")
        check("<file>" in run({"tool_name": "SendUserFile", "tool_input": {}}),
              "still gives a runnable remedy when no path is in the payload")

        check(SHOW.is_file(), "found tools/show.py from its own path (%s)" % SHOW.name)
    except Exception as exc:                           # noqa: BLE001 -- a crash IS a red test
        bad.append("selftest raised: %r" % (exc,))
        print("  FAIL  selftest raised: %r" % (exc,))

    print("selftest:", "PASS" if not bad else "RED")
    return 0 if not bad else 1


def main():
    if "--selftest" in sys.argv:
        return selftest()
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    try:
        ctx = run(payload)
    except Exception:                                  # noqa: BLE001 -- never break a session
        return 0
    if ctx:
        json.dump({"hookSpecificOutput": {"hookEventName": "PostToolUse",
                                          "additionalContext": ctx},
                   "systemMessage": "send-goes-nowhere: that file may not have arrived — "
                                    "deliver it as a darkroom path"}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
