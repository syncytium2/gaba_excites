/**
 * Render the literature folder from its single source of truth.
 *
 *   node scripts/lit.ts           # write lit/README.md, lit/references.bib, public/lit.html
 *   node scripts/lit.ts --check   # exit 1 if any of them is out of date (src/lit.test.ts runs this logic)
 *
 * lit/sources.json is the only file to edit by hand. The website's /lit page
 * is the companion: the same list, for a reader rather than a repository.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface Source {
  key: string;
  type: "article" | "book" | "chapter" | "code";
  authors: string[];
  year: number;
  title: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  booktitle?: string;
  publisher?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  url?: string;
  repo?: string;
  commit?: string;
  access: string;
  role: "model" | "parameter" | "method" | "background" | "further";
  models: string[];
  took: string;
  usedIn: string[];
  quotes?: { text: string; where: string }[];
  notes?: string;
}

const ROLE_ORDER: Source["role"][] = ["model", "parameter", "method", "background", "further"];
const ROLE_HEAD: Record<Source["role"], string> = {
  model: "Models",
  parameter: "Parameters",
  method: "Methods",
  background: "Background",
  further: "Further reading",
};
const ROLE_BLURB: Record<Source["role"], string> = {
  model: "Where the cells come from.",
  parameter: "Single values taken from measurements.",
  method: "How the numbers are computed.",
  background: "What the models were built on, credited but not read for any number here.",
  further: "Related work not yet used — candidates for the next presets.",
};
const MODEL_NAME: Record<string, string> = { rs: "pyramidal", gnrh: "GnRH" };

const REPO = "https://github.com/syncytium2/gaba_excites/blob/main/";

function cite(s: Source): string {
  const au = s.authors.length > 6 ? `${s.authors.slice(0, 6).join(", ")}, et al.` : s.authors.join(", ");
  if (s.type === "article") return `${au} (${s.year}). ${s.title}. ${s.journal} ${s.volume}${s.issue ? `(${s.issue})` : ""}:${s.pages}.`;
  if (s.type === "chapter") return `${au} (${s.year}). ${s.title}. In: ${s.booktitle}. ${s.publisher}.`;
  if (s.type === "book") return `${au} (${s.year}). ${s.title}. ${s.publisher}.`;
  return `${au} (${s.year}). ${s.title}.`;
}

function links(s: Source): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  if (s.doi) out.push({ label: `doi:${s.doi}`, href: `https://doi.org/${s.doi}` });
  if (s.pmid) out.push({ label: `PMID ${s.pmid}`, href: `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/` });
  if (s.pmcid) out.push({ label: s.pmcid, href: `https://pmc.ncbi.nlm.nih.gov/articles/${s.pmcid}/` });
  if (s.url) out.push({ label: s.url.replace(/^https?:\/\//, ""), href: s.url });
  if (s.repo) out.push({ label: `code @ ${s.commit?.slice(0, 7) ?? "HEAD"}`, href: s.commit ? `${s.repo}/tree/${s.commit}` : s.repo });
  return out;
}

function grouped(src: Source[]): [Source["role"], Source[]][] {
  return ROLE_ORDER.map((r) => [r, src.filter((s) => s.role === r)] as [Source["role"], Source[]]).filter(([, l]) => l.length > 0);
}

// ---------------------------------------------------------------- markdown

export function renderReadme(about: string, src: Source[]): string {
  const L: string[] = [];
  L.push("# lit — the literature behind gaba_excites", "");
  L.push("<!-- Rendered from sources.json by `node scripts/lit.ts`. Edit sources.json, not this file. -->", "");
  L.push(about, "");
  L.push("The same list is on the website at [/lit](https://gaba.tonydefazio.com/lit).", "");
  L.push("## What is here", "");
  L.push("| | |", "|---|---|");
  L.push("| `sources.json` | every source: citation, identifiers, what was taken from it, where it is used — **the file to edit** |");
  L.push("| `README.md`, `references.bib` | rendered from it |");
  L.push("| `notes/` | transcriptions: every number taken from a source, where it came from, and any ambiguity met on the way |");
  L.push("| `NEEDED.md` | papers to fetch by hand into `pdf/` |");
  L.push("| `pdf/` | local copies of the papers — **gitignored, never committed**, even open-access ones: this repository is public, and a licence to read is not a licence to redistribute |");
  L.push("");
  for (const [role, list] of grouped(src)) {
    L.push(`## ${ROLE_HEAD[role]}`, "", ROLE_BLURB[role], "");
    for (const s of list) {
      L.push(`### \`${s.key}\``, "");
      L.push(cite(s), "");
      const ln = links(s).map((l) => `[${l.label}](${l.href})`).join(" · ");
      L.push(`${ln}${ln ? " · " : ""}*${s.access}* · models: ${s.models.map((m) => MODEL_NAME[m] ?? m).join(", ")}`, "");
      L.push(`**Took:** ${s.took}`, "");
      if (s.quotes?.length) for (const q of s.quotes) L.push(`> ${q.text}`, `> — ${q.where}`, "");
      if (s.usedIn.length) L.push(`**Used in:** ${s.usedIn.map((f) => `[\`${f}\`](../${f})`).join(", ")}`, "");
      if (s.notes) L.push(`**Notes:** [\`${s.notes}\`](${s.notes})`, "");
    }
  }
  return L.join("\n");
}

// ---------------------------------------------------------------- bibtex

function bibEscape(t: string): string {
  return t.replace(/[{}]/g, "").replace(/–/g, "--").replace(/−/g, "-");
}

export function renderBib(src: Source[]): string {
  const out: string[] = ["% Rendered from lit/sources.json by `node scripts/lit.ts`. Edit sources.json, not this file.", ""];
  for (const s of src) {
    const kind = s.type === "article" ? "article" : s.type === "book" ? "book" : s.type === "chapter" ? "incollection" : "misc";
    const f: [string, string | undefined][] = [
      ["author", s.authors.map((a) => { const [last, ...ini] = a.split(" "); return `${last}, ${ini.join(" ")}`; }).join(" and ")],
      ["title", `{${bibEscape(s.title)}}`],
      ["journal", s.journal],
      ["booktitle", s.booktitle],
      ["publisher", s.publisher],
      ["year", String(s.year)],
      ["volume", s.volume],
      ["number", s.issue],
      ["pages", s.pages && bibEscape(s.pages)],
      ["doi", s.doi],
      ["pmid", s.pmid],
      ["pmcid", s.pmcid],
      ["url", s.url ?? s.repo],
      ["note", s.commit ? `commit ${s.commit}` : undefined],
    ];
    out.push(`@${kind}{${s.key},`);
    for (const [k, v] of f) if (v) out.push(`  ${k} = {${v}},`);
    out.push("}", "");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- html

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderHtml(about: string, src: Source[]): string {
  const sections = grouped(src)
    .map(([role, list]) => {
      const items = list
        .map((s) => {
          const ln = links(s).map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(" · ");
          const quotes = (s.quotes ?? [])
            .map((q) => `<blockquote>${esc(q.text)}<cite>${esc(q.where)}</cite></blockquote>`)
            .join("");
          const used = s.usedIn.length
            ? `<p class="used">Used in ${s.usedIn.map((f) => `<a href="${REPO}${esc(f)}"><code>${esc(f)}</code></a>`).join(", ")}${s.notes ? ` · <a href="${REPO}lit/${esc(s.notes)}">transcription notes</a>` : ""}</p>`
            : "";
          return `<li id="${esc(s.key)}">
  <p class="cite">${esc(cite(s))}</p>
  <p class="meta">${ln}${ln ? " · " : ""}<span>${esc(s.access)}</span> · <span>${s.models.map((m) => esc(MODEL_NAME[m] ?? m)).join(", ")}</span></p>
  <p class="took"><strong>Took:</strong> ${esc(s.took)}</p>${quotes}${used}
</li>`;
        })
        .join("\n");
      return `<h2 id="${role}">${ROLE_HEAD[role]}</h2>\n<p class="blurb">${ROLE_BLURB[role]}</p>\n<ol class="refs">\n${items}\n</ol>`;
    })
    .join("\n\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; form-action 'none'" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>gaba_excites — sources</title>
<meta name="description" content="Every paper and piece of code gaba_excites takes a number, an equation or a method from, and exactly what it took." />
<link rel="canonical" href="https://gaba.tonydefazio.com/lit" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<!-- Rendered from lit/sources.json by \`node scripts/lit.ts\`. Edit sources.json, not this file. -->
<style>
  :root { --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781; --grid: #e1e0d9; --page: #f9f9f7; --surface: #fcfcfb; }
  body { margin: 0; background: var(--page); color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.6; }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.1rem 4rem; }
  h1 { font-size: 1.7rem; margin: 0 0 0.3rem; }
  h2 { font-size: 1.2rem; margin: 2.2rem 0 0.2rem; }
  .sub, .blurb { color: var(--ink-2); margin: 0 0 1rem; }
  a { color: #1f63b8; overflow-wrap: anywhere; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.85em; }
  ol.refs { list-style: none; padding: 0; margin: 0; }
  ol.refs li { background: var(--surface); border: 1px solid var(--grid); border-radius: 8px; padding: 0.7rem 0.9rem; margin: 0 0 0.8rem; }
  .cite { margin: 0 0 0.3rem; }
  .meta { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--muted); }
  .took { margin: 0.3rem 0; }
  .used { margin: 0.3rem 0 0; font-size: 0.85rem; color: var(--ink-2); }
  blockquote { margin: 0.5rem 0; padding: 0.3rem 0.8rem; border-left: 3px solid var(--grid); color: var(--ink-2); }
  blockquote cite { display: block; font-size: 0.8rem; color: var(--muted); font-style: normal; margin-top: 0.2rem; }
  footer { color: var(--muted); font-size: 0.85rem; margin-top: 3rem; }
</style>
</head>
<body>
<main>
<h1>Sources</h1>
<p class="sub">${esc(about.replace(/ The single source of truth.*$/, ""))} Each entry says exactly what was taken from it and where in the code it lives.
<a href="/">Simulator</a> · <a href="/methods">Methods</a> · <a href="${REPO}lit/references.bib">BibTeX</a></p>

${sections}

<footer>
  <p>Rendered from <a href="${REPO}lit/sources.json"><code>lit/sources.json</code></a>. gaba_excites is open source (MIT):
  <a href="https://github.com/syncytium2/gaba_excites">github.com/syncytium2/gaba_excites</a>. By <a href="https://tonydefazio.com/">Tony DeFazio</a>.</p>
</footer>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------- main

export function renderAll(root: string): Record<string, string> {
  const { about, sources } = JSON.parse(readFileSync(join(root, "lit/sources.json"), "utf8")) as { about: string; sources: Source[] };
  return {
    "lit/README.md": renderReadme(about, sources),
    "lit/references.bib": renderBib(sources),
    "public/lit.html": renderHtml(about, sources),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files = renderAll(root);
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [rel, text] of Object.entries(files)) {
    const path = join(root, rel);
    let cur = "";
    try {
      cur = readFileSync(path, "utf8");
    } catch {
      /* new file */
    }
    if (cur === text) continue;
    if (check) {
      console.error(`stale: ${rel}`);
      stale++;
    } else {
      writeFileSync(path, text);
      console.log(`wrote ${rel}`);
    }
  }
  if (stale) process.exit(1);
}
