import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

// Born-on date AND time, baked at build from git — not fetched at runtime,
// because the CSP below forbids the page any network connection at all.
// Born = the root commit; updated = HEAD. %cI keeps the committer's offset.
function git(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").pop() || fallback;
  } catch {
    return fallback;
  }
}
const BORN = git("git log --max-parents=0 --format=%cI", "2026-09-21T11:53:40-04:00");
const UPDATED = git("git log -1 --format=%cI", BORN);

// In a shallow clone the root commit is not in the graph, and --max-parents=0
// returns HEAD: the Born stamp would silently read as the build time. This
// shipped once in colonel_kernel (2026-07-16). Refuse to build instead.
function assertFullHistory(): Plugin {
  return {
    name: "assert-full-history-on-build",
    apply: "build",
    buildStart() {
      if (git("git rev-parse --is-shallow-repository", "false") === "true") {
        throw new Error(
          `Shallow clone: the Born stamp would be wrong (got ${BORN}). ` +
            "Run `git fetch --unshallow`, or in CI use actions/checkout with fetch-depth: 0.",
        );
      }
    },
  };
}

// The production CSP, injected into the BUILT index.html only, so the dev
// server's HMR websocket still works. connect-src 'none' is the guarantee that
// nothing this page computes can leave the machine. worker-src covers the
// simulation worker, which is bundled and same-origin. style-src needs
// 'unsafe-inline' because uPlot and React set element styles.
const PROD_CSP =
  "default-src 'self'; connect-src 'none'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'none'";

function injectCsp(): Plugin {
  return {
    name: "inject-csp-on-build",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: PROD_CSP }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  plugins: [react(), assertFullHistory(), injectCsp()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_BORN__: JSON.stringify(BORN),
    __BUILD_UPDATED__: JSON.stringify(UPDATED),
  },
  worker: { format: "es" },
});
