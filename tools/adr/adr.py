#!/usr/bin/env python3
# vendored from syncytium2/armory @ 1649990b — tools/adr/adr.py
# instrument: verification
"""adr — write ADRs that cannot collide, and check the rules that keep them honest.

    adr.py new "Solver uses implicit Euler"   write <dir>/YYYY-MM-DD-<4 hex>-<slug>.md, add it to the index
    adr.py check                              every rule below; exit 1 on any failure
    adr.py hook                               Claude Code PreToolUse gate on git commit / merge / push
    adr.py --selftest                         build fixture repos, break each rule, require each to fire

WHY THIS EXISTS
---------------
The estate was once good at ADR hygiene, in one repo, and it did not travel. interface2's
`next_adr.sh` and its SAP025 rule fired from a git pre-commit hook, which is local configuration:
a fresh clone or a new worktree does not get it. bugarach rebuilt part of it as a test after its ADR
habit lapsed for 25 days. gaba_excites wrote a full specification on 2026-10-18 and never built it.
See docs/handoffs/2026-11-03-adr-hygiene-has-no-kit.md and 2026-11-03-adr-kit-decisions.md.

WHY THE IDS ARE DATE + HASH, NOT NUMBERS
----------------------------------------
Tony, 2026-11-03, asked how numbering collisions should be handled: "this has been a recurring
problem as we work with multiple sessions on multiple machines in parallel in the same repo. maybe
the adr just needs a unique hash going forward." A sequential number is safe only if the session
picking it can see every other session's branches, and unpushed work on another machine is
invisible to it. next_adr.sh could only report a collision after both records existed. A random
suffix removes the race instead of detecting it; the date keeps the folder in order. Numbered ADRs
keep their numbers. Both forms live in one folder.

THE RULES (names are what .adr-kit.json "severity" keys on)
-----------------------------------------------------------
    filename            NNNN-kebab.md or YYYY-MM-DD-hhhh-kebab.md; nothing else that starts with a digit
    heading             the first H1 carries the file's ID
    status              Proposed | Accepted | Deprecated | Superseded by <ADR>, with a YYYY-MM-DD date
    supersession        "Superseded by X" and X's "Supersedes" name each other, both directions
    index               the folder's README.md (or index.md) links every ADR, and every link resolves
    links               relative links in ADRs, and links into the ADR folder from any tracked .md, resolve
    bare-citation       an ADR is cited by a link to its file or by its filename, never by bare ID
    accepted-immutable  after Accepted, the body changes only in the status line and in a dated
                        "## Amendments" section; checked against git history; a shallow clone FAILS
    collision           one ID names one file, on this branch and across every local and remote ref

A repo may lower a rule to "warn" in .adr-kit.json. It cannot switch one off: a rule that can be
silenced is a rule nobody can rely on, and the README lists what is unenforced, plainly.

This tool never fetches. In CI, check out with full history (fetch-depth: 0) so the collision check
sees every pushed branch; the hook is the layer that sees unpushed branches in sibling worktrees.
"""
import datetime
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile

RULES = ["filename", "heading", "status", "supersession", "index", "links",
         "bare-citation", "accepted-immutable", "collision"]
DIR_CANDIDATES = ["docs/adr", "docs/decisions", "decisions", "doc/adr", "adr"]
INDEX_NAMES = ["README.md", "index.md"]
CONFIG = ".adr-kit.json"
TEXT_EXT = {".md", ".py", ".ts", ".tsx", ".js", ".mjs", ".sh", ".m", ".r", ".jl", ".rs",
            ".go", ".txt", ".rst", ".toml", ".yml", ".yaml"}

NEW_ID = r"\d{4}-\d{2}-\d{2}-[0-9a-f]{4}"
SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
NEW_FILE = re.compile(rf"^({NEW_ID})-({SLUG})\.md$")
OLD_FILE = re.compile(rf"^(\d{{4}})-({SLUG})\.md$")
LINK = re.compile(r"\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
FIELD = r"^\s*(?:[-*]\s+)?\**{name}\**\s*:?\**\s*(?P<v>.*?)\s*$"
STATUS_LINE = re.compile(FIELD.format(name="Status"), re.I)
SUPERSEDES_LINE = re.compile(FIELD.format(name="Supersedes"), re.I)
DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
TRAILING_DATE = re.compile(r"[,;:]?\s*\(?\d{4}-\d{2}-\d{2}\)?\.?\s*$")
STATES = re.compile(r"^(Proposed|Accepted|Deprecated|Superseded by\b(?P<by>.*))", re.I)
AMEND_HEAD = re.compile(r"^#{1,6}\s*Amendments?\b", re.I)
GITCMD = re.compile(r"\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+(commit|merge|push|pull|rebase)\b")


class Error(Exception):
    """A usage or repository problem: exit 2, not a rule failure."""


def git(repo, *args, ok=(0,)):
    p = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if p.returncode not in ok:
        return None
    return p.stdout


def adr_id(name):
    """The ID a filename carries, or None. Legacy IDs keep their four digits."""
    m = NEW_FILE.match(name) or OLD_FILE.match(name)
    return m.group(1) if m else None


def blank_fences(text):
    """Blank fenced code blocks, keeping line numbers, so examples are not checked as prose."""
    out, fence = [], None
    for ln in text.split("\n"):
        s = ln.lstrip()
        if fence is None and (s.startswith("```") or s.startswith("~~~")):
            fence = s[:3]
            out.append("")
        elif fence is not None:
            if s.startswith(fence):
                fence = None
            out.append("")
        else:
            out.append(ln)
    return out


# ---------------------------------------------------------------- the repository's ADRs

class Repo:
    def __init__(self, root, adr_dir=None):
        top = git(root, "rev-parse", "--show-toplevel")
        if top is None:
            raise Error(f"{root}: not a git repository")
        self.root = top.strip()
        cfg_path = os.path.join(self.root, CONFIG)
        self.cfg = {}
        if os.path.exists(cfg_path):
            with open(cfg_path) as f:
                self.cfg = json.load(f)
        self.dir = adr_dir or self.cfg.get("dir") or self.find_dir()
        self.abs_dir = os.path.join(self.root, self.dir)
        if not os.path.isdir(self.abs_dir):
            raise Error(f"{self.dir}: no such folder")
        sev = self.cfg.get("severity", {})
        bad = [k for k, v in sev.items() if k not in RULES or v not in ("fail", "warn")]
        if bad:
            raise Error(f"{CONFIG}: severity takes a rule from {RULES} and 'fail' or 'warn'; "
                        f"refused {bad} (a rule cannot be switched off)")
        self.severity = {r: sev.get(r, "fail") for r in RULES}
        self.files = sorted(n for n in os.listdir(self.abs_dir) if n.endswith(".md"))
        self.adrs = {n: adr_id(n) for n in self.files if adr_id(n)}
        self.by_id = {}
        for n, i in self.adrs.items():
            self.by_id.setdefault(i, []).append(n)
        self.findings = []

    def find_dir(self):
        found = []
        for c in DIR_CANDIDATES:
            p = os.path.join(self.root, c)
            if os.path.isdir(p) and any(adr_id(n) or n in INDEX_NAMES for n in os.listdir(p)):
                found.append(c)
        if not found:
            raise Error(f"no ADR folder found (looked for {', '.join(DIR_CANDIDATES)}); "
                        f"pass --dir or set \"dir\" in {CONFIG}")
        if len(found) > 1:
            raise Error(f"more than one ADR folder: {', '.join(found)}; pick one with --dir "
                        f"or \"dir\" in {CONFIG}")
        return found[0]

    def rel(self, name):
        return f"{self.dir}/{name}"

    def read(self, name):
        with open(os.path.join(self.abs_dir, name), encoding="utf-8", errors="replace") as f:
            return f.read()

    def flag(self, rule, where, msg):
        self.findings.append((self.severity[rule], rule, where, msg))

    # -- references --------------------------------------------------------------------

    def ids_in(self, text):
        """ADR IDs a piece of text refers to, by link, by ADR-prefixed token, or by bare new ID."""
        out = set()
        for _, target in LINK.findall(text):
            i = adr_id(os.path.basename(target.split("#")[0]))
            if i:
                out.add(i)
        for m in re.finditer(rf"\bADR[- ]?({NEW_ID})(?![\w-])", text):
            out.add(m.group(1))
        for m in re.finditer(r"\bADR[- ]?(\d{1,4})(?![\w-])", text):
            out.add(m.group(1).zfill(4))
        for m in re.finditer(rf"(?<![\w/-])({NEW_ID})(?![\w-])", text):
            out.add(m.group(1))
        return out

    # -- per-file rules ----------------------------------------------------------------

    def parse_status(self, lines):
        """(value, [line indexes that hold it]) from 'Status: X' or a '## Status' section."""
        for i, ln in enumerate(lines):
            if re.match(r"^#{1,6}\s*Status\s*$", ln, re.I):
                for j in range(i + 1, len(lines)):
                    if lines[j].strip():
                        if lines[j].lstrip().startswith("#"):
                            break
                        return lines[j].strip().strip("*").strip(), [i, j]
                return "", [i]
            m = STATUS_LINE.match(ln)
            if m and not ln.lstrip().startswith("#"):
                return m.group("v").strip("*").strip(), [i]
        return None, []

    def check_file(self, name):
        rid = self.adrs[name]
        text = self.read(name)
        lines = text.split("\n")
        h1 = next((ln for ln in blank_fences(text) if ln.startswith("# ")), None)
        if h1 is None:
            self.flag("heading", self.rel(name), "no H1 heading")
        elif NEW_FILE.match(name):
            if rid not in h1:
                self.flag("heading", self.rel(name), f"H1 does not carry the ID {rid}: {h1!r}")
        elif not re.search(rf"(?<!\d)0*{int(rid)}(?!\d)", h1):
            self.flag("heading", self.rel(name), f"H1 does not carry the number {rid}: {h1!r}")

        value, _ = self.parse_status(lines)
        if value is None:
            self.flag("status", self.rel(name), "no Status line")
            return
        m = STATES.match(value)
        if not m:
            self.flag("status", self.rel(name),
                      f"status {value!r} is not Proposed, Accepted, Deprecated or Superseded by <ADR>")
        elif not DATE.search(value):
            self.flag("status", self.rel(name), f"status {value!r} carries no YYYY-MM-DD date")
        if m and m.group("by") is not None:
            targets = self.ids_in(TRAILING_DATE.sub("", m.group("by"))) - {rid}
            if not targets:
                self.flag("supersession", self.rel(name), f"'Superseded by' names no ADR: {value!r}")
            for t in targets:
                if t not in self.by_id:
                    self.flag("supersession", self.rel(name), f"superseded by {t}, which does not exist")
                    continue
                back = self.supersedes(self.by_id[t][0])
                if rid not in back:
                    self.flag("supersession", self.rel(name),
                              f"superseded by {t}, but {self.by_id[t][0]} has no 'Supersedes' naming {rid}")
        for t in self.supersedes(name) - {rid}:
            if t not in self.by_id:
                self.flag("supersession", self.rel(name), f"supersedes {t}, which does not exist")
                continue
            other = self.by_id[t][0]
            ov, _ = self.parse_status(self.read(other).split("\n"))
            om = STATES.match(ov or "")
            if not (om and om.group("by") is not None and rid in self.ids_in(om.group("by"))):
                self.flag("supersession", self.rel(name),
                          f"supersedes {t}, but {other}'s status is not 'Superseded by' {rid}")

    def supersedes(self, name):
        out = set()
        for ln in self.read(name).split("\n"):
            m = SUPERSEDES_LINE.match(ln)
            if m and not ln.lstrip().startswith("#"):
                out |= self.ids_in(TRAILING_DATE.sub("", m.group("v")))
        return out

    # -- folder and repo rules ---------------------------------------------------------

    def check_filenames(self):
        for n in os.listdir(self.abs_dir):
            if n[:1].isdigit() and not adr_id(n):
                self.flag("filename", self.rel(n),
                          "starts with a digit but is not NNNN-kebab.md or YYYY-MM-DD-hhhh-kebab.md")

    def check_index(self):
        idx = next((n for n in INDEX_NAMES if n in self.files), None)
        if idx is None:
            self.flag("index", self.dir, f"no index ({' or '.join(INDEX_NAMES)}) in the ADR folder")
            return
        linked = set()
        for ln in blank_fences(self.read(idx)):
            for _, target in LINK.findall(ln):
                b = os.path.basename(target.split("#")[0])
                if adr_id(b) and os.path.dirname(target.split("#")[0]) in ("", "."):
                    linked.add(b)
        for n in self.adrs:
            if n not in linked:
                self.flag("index", self.rel(n), f"not linked from {self.rel(idx)}")
        for b in sorted(linked - set(self.adrs)):
            self.flag("index", self.rel(idx), f"links {b}, which is not in the folder")

    def tracked(self):
        out = git(self.root, "ls-files", "-z", "--cached", "--others", "--exclude-standard") or ""
        me = os.path.realpath(__file__)
        skip = set(self.cfg.get("exclude", [])) | {CONFIG}
        for p in sorted(set(filter(None, out.split("\0")))):
            full = os.path.join(self.root, p)
            if p in skip or any(p.startswith(s.rstrip("/") + "/") for s in skip):
                continue
            if os.path.realpath(full) == me or not os.path.isfile(full):
                continue
            yield p, full

    def check_links_and_citations(self):
        adr_abs = os.path.realpath(self.abs_dir)
        for p, full in self.tracked():
            ext = os.path.splitext(p)[1].lower()
            if ext not in TEXT_EXT:
                continue
            try:
                with open(full, encoding="utf-8") as f:
                    text = f.read()
            except (UnicodeDecodeError, OSError):
                continue
            in_adr_dir = os.path.realpath(os.path.dirname(full)) == adr_abs
            lines = blank_fences(text) if ext == ".md" else text.split("\n")
            if in_adr_dir:
                # an ADR's own heading and its Status/Supersedes lines name IDs by design
                _, sidx = self.parse_status(lines)
                h1 = next((k for k, ln in enumerate(lines) if ln.startswith("# ")), None)
                for k in set(sidx) | ({h1} if h1 is not None else set()):
                    lines[k] = ""
                lines = ["" if SUPERSEDES_LINE.match(ln) else ln for ln in lines]
            for k, ln in enumerate(lines, 1):
                if ext == ".md":
                    for _, target in LINK.findall(ln):
                        t = target.split("#")[0]
                        if not t or re.match(r"^[a-z][a-z0-9+.-]*:", t, re.I) or t.startswith("/"):
                            continue
                        dest = os.path.realpath(os.path.join(os.path.dirname(full), t))
                        inside = dest == adr_abs or dest.startswith(adr_abs + os.sep)
                        if (in_adr_dir or inside) and not os.path.exists(dest):
                            self.flag("links", f"{p}:{k}", f"link to {target} does not resolve")
                self.bare_citations(p, k, ln)

    def bare_citations(self, p, k, ln):
        s = LINK.sub(lambda m: " " * len(m.group(0))
                     if adr_id(os.path.basename(m.group(2).split("#")[0])) else m.group(0), ln)
        s = re.sub(rf"(?:{NEW_ID}|\d{{4}})-[a-z][a-z0-9-]*(?:\.md)?", " ", s)
        hits = [m.group(0) for m in re.finditer(rf"\bADR[- ]?{NEW_ID}(?![\w-])", s)]
        s = re.sub(rf"\bADR[- ]?{NEW_ID}(?![\w-])", " ", s)
        hits += [m.group(0) for m in re.finditer(r"\bADR[- ]?\d{1,4}(?![\w-])", s)]
        hits += [m.group(1) for m in re.finditer(rf"(?<![\w/-])({NEW_ID})(?![\w-])", s)
                 if m.group(1) in self.by_id]
        for h in hits:
            i = re.sub(r"^ADR[- ]?", "", h)
            i = i if "-" in i else i.zfill(4)
            hint = ("; link the file or name it by filename" if i in self.by_id else
                    ", and no ADR here has that ID; if it is another repo's, name that file "
                    "(e.g. interface2 decisions/0006-slug.md)")
            self.flag("bare-citation", f"{p}:{k}", f"{h!r} cited by bare ID{hint}")

    def check_collisions(self):
        seen = {}  # id -> {filename: [where]}
        for n, i in self.adrs.items():
            seen.setdefault(i, {}).setdefault(n, []).append("working tree")
        refs = git(self.root, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes") or ""
        for ref in refs.split():
            if ref.endswith("/HEAD"):
                continue
            listing = git(self.root, "ls-tree", "-r", "--name-only", ref, "--", self.dir + "/") or ""
            for path in listing.split("\n"):
                if os.path.dirname(path) != self.dir:
                    continue
                b = os.path.basename(path)
                i = adr_id(b)
                if i:
                    seen.setdefault(i, {}).setdefault(b, []).append(ref.split("/", 2)[-1])
        for i, names in sorted(seen.items()):
            if len(names) > 1:
                desc = "; ".join(f"{n} on {', '.join(sorted(set(w))[:3])}" for n, w in sorted(names.items()))
                self.flag("collision", f"{self.dir} {i}", f"one ID, {len(names)} files: {desc}")
        return seen

    def check_immutable(self):
        shallow = (git(self.root, "rev-parse", "--is-shallow-repository") or "").strip()
        if shallow == "true":
            self.flag("accepted-immutable", self.dir,
                      "shallow clone: history is cut, so edits to accepted ADRs cannot be checked. "
                      "Clone with full history (CI: fetch-depth: 0)")
            return
        for n in self.adrs:
            rel = self.rel(n)
            log = git(self.root, "log", "--follow", "--format=@%H", "--name-only", "--", rel) or ""
            commits, cur = [], None
            for ln in log.split("\n"):
                if ln.startswith("@"):
                    cur = ln[1:]
                elif ln.strip() and cur:
                    commits.append((cur, ln.strip()))
                    cur = None
            base = None
            for c, path in reversed(commits):
                old = git(self.root, "show", f"{c}:{path}")
                if old is None:
                    continue
                v, _ = self.parse_status(old.split("\n"))
                if v and re.match(r"^Accepted\b", v, re.I):
                    base = (c, old)
                    break
            text = self.read(n)
            self.check_amendments(rel, text)
            if base is None:
                continue
            a, b = self.body(base[1]), self.body(text)
            if a != b:
                k = next((j for j in range(max(len(a), len(b)))
                          if j >= len(a) or j >= len(b) or a[j] != b[j]), 0)
                was = a[k] if k < len(a) else "(nothing)"
                now = b[k] if k < len(b) else "(nothing)"
                self.flag("accepted-immutable", rel,
                          f"body changed since it was accepted in {base[0][:8]}: "
                          f"{was!r} became {now!r}. Change only the status line, "
                          f"or add a dated note under '## Amendments'")

    def body(self, text):
        lines = text.split("\n")
        _, sidx = self.parse_status(lines)
        cut = next((k for k, ln in enumerate(lines) if AMEND_HEAD.match(ln)), len(lines))
        out = [ln.rstrip() for k, ln in enumerate(lines[:cut]) if k not in sidx]
        while out and not out[-1]:
            out.pop()
        return out

    def check_amendments(self, rel, text):
        lines = text.split("\n")
        start = next((k for k, ln in enumerate(lines) if AMEND_HEAD.match(ln)), None)
        if start is None:
            return
        para = []
        for ln in lines[start + 1:] + [""]:
            if ln.strip() and not ln.lstrip().startswith("#"):
                if ln.lstrip()[:2] in ("- ", "* ") and para:
                    self.amend_dated(rel, para)
                    para = []
                para.append(ln)
            elif para:
                self.amend_dated(rel, para)
                para = []

    def amend_dated(self, rel, para):
        head = para[0].lstrip(" -*>").lstrip("*_ ")
        if not re.match(r"^\d{4}-\d{2}-\d{2}\b", head):
            self.flag("accepted-immutable", rel, f"amendment does not start with a YYYY-MM-DD date: {para[0].strip()!r}")

    def check(self):
        self.check_filenames()
        for n in self.adrs:
            self.check_file(n)
        self.check_index()
        self.check_links_and_citations()
        self.check_collisions()
        self.check_immutable()
        return self.findings


# ---------------------------------------------------------------- new

def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s[:60].rstrip("-") or "decision"


def new(repo, title, today=None):
    today = today or datetime.date.today().isoformat()
    taken = set(repo.check_collisions())
    repo.findings = []
    for _ in range(64):
        i = f"{today}-{secrets.token_hex(2)}"
        if i not in taken:
            break
    else:
        raise Error("64 random IDs in a row were taken; something is wrong")
    name = f"{i}-{slugify(title)}.md"
    path = os.path.join(repo.abs_dir, name)
    with open(path, "x") as f:
        f.write(f"# ADR {i}: {title}\n\nStatus: Proposed, {today}\n\n"
                "## Context\n\n## Decision\n\n## Consequences\n")
    idx = next((n for n in INDEX_NAMES if n in repo.files), None)
    idx_path = os.path.join(repo.abs_dir, idx or INDEX_NAMES[0])
    with open(idx_path, "a") as f:
        if idx is None:
            f.write("# Architecture decision records\n\n")
        f.write(f"- [{title}]({name}) — Proposed, {today}\n")
    return os.path.join(repo.dir, name)


# ---------------------------------------------------------------- output

def report(findings, out=sys.stdout):
    fails = 0
    for sev, rule, where, msg in sorted(findings, key=lambda f: (f[0] != "fail", f[2], f[1])):
        fails += sev == "fail"
        print(f"{'FAIL' if sev == 'fail' else 'warn'} [{rule}] {where}: {msg}", file=out)
    warns = len(findings) - fails
    print(f"adr check: {fails} failure(s), {warns} warning(s)", file=out)
    return 1 if fails else 0


def hook():
    """PreToolUse on Bash: block git commit/merge/push/pull/rebase while ADR checks fail."""
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    cmd = (data.get("tool_input") or {}).get("command", "")
    if not GITCMD.search(cmd):
        return 0
    try:
        repo = Repo(data.get("cwd") or os.getcwd())
    except Error as e:
        if "no ADR folder" in str(e):
            return 0
        print(f"adr hook: {e}", file=sys.stderr)
        return 0
    if report(repo.check(), out=sys.stderr):
        print("adr hook: fix the failures above before this git command runs "
              "(python3 tools/adr/adr.py check).", file=sys.stderr)
        return 2
    return 0


# ---------------------------------------------------------------- selftest

def selftest():
    tmp = tempfile.mkdtemp(prefix="adr-selftest-")
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t",
               GIT_COMMITTER_EMAIL="t@t", GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
    results = []

    def sh(cwd, *a):
        subprocess.run(["git", *a], cwd=cwd, env=env, check=True, capture_output=True)

    def write(root, rel, text):
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)

    old = "0001-use-sqlite.md"
    new_ = "2026-11-03-a3f9-use-postgres.md"
    base_files = {
        "docs/adr/README.md": f"# ADRs\n\n- [Use SQLite]({old})\n- [Use Postgres]({new_})\n",
        f"docs/adr/{old}": ("# ADR-0001: Use SQLite\n\n"
                            f"Status: Superseded by [Use Postgres]({new_}), 2026-11-03\n\n"
                            "## Decision\n\nSQLite, one file.\n"),
        f"docs/adr/{new_}": ("# ADR 2026-11-03-a3f9: Use Postgres\n\n"
                             "Status: Accepted, 2026-11-03\n"
                             f"Supersedes: [Use SQLite]({old})\n\n"
                             "## Decision\n\nPostgres, because two writers.\n"),
        "README.md": f"See [Use Postgres](docs/adr/{new_}).\n",
        "src/db.py": f"# storage choice: docs/adr/{new_}\n",
    }

    def fixture(name):
        root = os.path.join(tmp, name)
        os.makedirs(root)
        sh(root, "init", "-q", "-b", "main")
        for rel, text in base_files.items():
            write(root, rel, text)
        sh(root, "add", "-A")
        sh(root, "commit", "-qm", "base")
        return root

    def run(root, **kw):
        r = Repo(root, **kw)
        return r, r.check()

    def expect(label, root, rule, mutate=None, commit=False, sev="fail", also=()):
        if mutate:
            mutate(root)
            if commit:
                sh(root, "add", "-A")
                sh(root, "commit", "-qm", label)
        _, f = run(root)
        got = [x for x in f if x[1] == rule and x[0] == sev]
        others = [x for x in f if x[1] != rule and x[1] not in also]
        ok = bool(got) and not others
        results.append((ok, label, f))

    # a clean fixture passes, with nothing at all to say
    root = fixture("clean")
    _, f = run(root)
    results.append((not f, "a clean fixture passes", f))

    def edit(rel, old_s, new_s):
        def m(root):
            p = os.path.join(root, rel)
            with open(p) as fh:
                t = fh.read()
            assert old_s in t, (rel, old_s)
            write(root, rel, t.replace(old_s, new_s))
        return m

    A, B = f"docs/adr/{old}", f"docs/adr/{new_}"
    expect("a misnamed ADR file fires filename", fixture("fn"), "filename",
           lambda r: write(r, "docs/adr/0002_Bad Name.md", "# ADR-0002\n"))
    expect("an H1 without the ID fires heading", fixture("h1"), "heading",
           edit(B, "# ADR 2026-11-03-a3f9: Use Postgres", "# ADR: Use Postgres"),
           also=("accepted-immutable",))
    expect("a legacy H1 with the wrong number fires heading", fixture("h1old"), "heading",
           edit(A, "# ADR-0001: Use SQLite", "# ADR-0007: Use SQLite"))
    expect("an undated status fires status", fixture("st"), "status",
           edit(B, "Status: Accepted, 2026-11-03", "Status: Accepted"))
    expect("an unknown state fires status", fixture("st2"), "status",
           edit(B, "Status: Accepted, 2026-11-03", "Status: Approved, 2026-11-03"))
    expect("supersedes with no superseded-by back fires supersession", fixture("sup1"), "supersession",
           edit(A, f"Status: Superseded by [Use Postgres]({new_}), 2026-11-03", "Status: Deprecated, 2026-11-03"))
    expect("superseded-by with no supersedes back fires supersession", fixture("sup2"), "supersession",
           edit(B, f"Supersedes: [Use SQLite]({old})\n", ""), also=("accepted-immutable",))
    expect("an ADR missing from the index fires index", fixture("idx"), "index",
           edit("docs/adr/README.md", f"- [Use Postgres]({new_})\n", ""))
    expect("a broken link into the ADR folder fires links", fixture("ln"), "links",
           lambda r: write(r, "docs/notes.md", "[gone](adr/0009-gone.md)\n"))
    expect("a bare legacy citation fires bare-citation", fixture("bc1"), "bare-citation",
           lambda r: write(r, "docs/notes.md", "As ADR-0001 says.\n"))
    expect("a bare new-ID citation fires bare-citation", fixture("bc2"), "bare-citation",
           lambda r: write(r, "src/x.py", "# see 2026-11-03-a3f9\n"))
    expect("editing an accepted body fires accepted-immutable", fixture("imm"), "accepted-immutable",
           edit(B, "Postgres, because two writers.", "Postgres, because it is fashionable."))
    expect("an undated amendment fires accepted-immutable", fixture("amd"), "accepted-immutable",
           lambda r: open(os.path.join(r, B), "a").write("\n## Amendments\n\n- we also use pgbouncer\n"))

    # allowed changes stay quiet: a dated amendment, and a status change
    root = fixture("allowed")
    open(os.path.join(root, B), "a").write("\n## Amendments\n\n- 2026-11-04: pgbouncer in front.\n")
    edit(B, "Status: Accepted, 2026-11-03", "Status: Deprecated, 2026-11-05")(root)
    _, f = run(root)
    results.append((not f, "a dated amendment and a status change pass", f))

    # one ID, two files on two branches
    root = fixture("col")
    sh(root, "checkout", "-qb", "other")
    write(root, "docs/adr/2026-11-03-a3f9-something-else.md", "x")
    sh(root, "add", "-A")
    sh(root, "commit", "-qm", "other")
    sh(root, "checkout", "-q", "main")
    _, f = run(root)
    got = [x for x in f if x[1] == "collision"]
    results.append((bool(got) and len(f) == len(got), "one ID on two branches fires collision", f))

    # a shallow clone must fail, never skip
    src = fixture("deep")
    edit(B, "two writers.", "two writers")(src)
    sh(src, "commit", "-qam", "second")
    shallow = os.path.join(tmp, "shallow")
    sh(tmp, "clone", "-q", "--depth", "1", "file://" + src, shallow)
    _, f = run(shallow)
    got = [x for x in f if x[1] == "accepted-immutable" and "shallow" in x[3]]
    results.append((bool(got), "a shallow clone fails accepted-immutable", f))

    # a lowered rule warns and the check exits 0; an attempt to switch one off is refused
    root = fixture("warn")
    write(root, "docs/notes.md", "As ADR-0001 says.\n")
    write(root, CONFIG, json.dumps({"severity": {"bare-citation": "warn"}}))
    _, f = run(root)
    results.append((f and all(x[0] == "warn" for x in f) and report(f, open(os.devnull, "w")) == 0,
                    "a rule lowered to warn does not fail the check", f))
    write(root, CONFIG, json.dumps({"severity": {"bare-citation": "off"}}))
    try:
        Repo(root)
        results.append((False, "severity 'off' is refused", []))
    except Error:
        results.append((True, "severity 'off' is refused", []))

    # new writes a file that passes every check, and adds it to the index
    root = fixture("new")
    r = Repo(root)
    rel = new(r, "Cache with Redis", today="2026-11-03")
    _, f = run(root)
    ok = bool(re.match(rf"docs/adr/{NEW_ID}-cache-with-redis\.md$", rel)) and not f
    results.append((ok, "new writes a valid ADR and indexes it", f + [("", "", rel, "")]))

    # the hook blocks a commit while a check fails, and ignores other commands
    root = fixture("hook")
    write(root, "docs/notes.md", "As ADR-0001 says.\n")

    def hook_exit(cmd):
        p = subprocess.run([sys.executable, os.path.realpath(__file__), "hook"], env=env,
                           input=json.dumps({"tool_input": {"command": cmd}, "cwd": root}),
                           capture_output=True, text=True)
        return p.returncode
    results.append((hook_exit("git commit -m x") == 2 and hook_exit("ls docs") == 0,
                    "the hook blocks a commit while a check fails", []))

    shutil.rmtree(tmp, ignore_errors=True)
    bad = [r for r in results if not r[0]]
    for ok, label, f in results:
        print(f"  {'ok ' if ok else 'RED'} {label}")
        if not ok:
            for x in f:
                print(f"        {x}")
    print(f"selftest: {'PASS' if not bad else 'RED'}")
    return 0 if not bad else 1


# ---------------------------------------------------------------- main

def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if "--selftest" in argv:
        return selftest()
    if argv[0] == "hook":
        return hook()
    adr_dir = None
    if "--dir" in argv:
        k = argv.index("--dir")
        adr_dir = argv[k + 1].rstrip("/")
        argv = argv[:k] + argv[k + 2:]
    try:
        repo = Repo(os.getcwd(), adr_dir)
        if argv[0] == "check":
            return report(repo.check())
        if argv[0] == "new" and len(argv) == 2:
            print(new(repo, argv[1]))
            return 0
    except Error as e:
        print(f"adr: {e}", file=sys.stderr)
        return 2
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
