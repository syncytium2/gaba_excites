/**
 * The literature folder stays honest: the rendered files match sources.json,
 * every DOI the methods page cites is listed, and every file a source claims
 * to be used in, or to have notes in, exists.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAll, type Source } from "../scripts/lit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { sources } = JSON.parse(readFileSync(join(root, "lit/sources.json"), "utf8")) as { sources: Source[] };

describe("lit/", () => {
  it("README.md, references.bib and public/lit.html are rendered from sources.json (run `node scripts/lit.ts`)", () => {
    for (const [rel, text] of Object.entries(renderAll(root))) expect(readFileSync(join(root, rel), "utf8"), rel).toBe(text);
  });

  it("every DOI cited on the methods page is in sources.json", () => {
    const methods = readFileSync(join(root, "public/methods.html"), "utf8");
    const dois = new Set(sources.map((s) => s.doi).filter(Boolean));
    for (const m of methods.matchAll(/doi\.org\/([^"<\s]+)/g)) expect(dois.has(m[1]), m[1]).toBe(true);
  });

  it("every usedIn file and notes file exists; keys are unique", () => {
    for (const s of sources) {
      for (const f of s.usedIn) expect(existsSync(join(root, f)), `${s.key}: ${f}`).toBe(true);
      if (s.notes) expect(existsSync(join(root, "lit", s.notes)), `${s.key}: ${s.notes}`).toBe(true);
    }
    expect(new Set(sources.map((s) => s.key)).size).toBe(sources.length);
  });

  it("no paper is committed: lit/pdf holds only its placeholder", () => {
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^lit\/pdf\/\*$/m);
  });
});
