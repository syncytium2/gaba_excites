declare const __APP_VERSION__: string;
declare const __BUILD_BORN__: string;
declare const __BUILD_UPDATED__: string;

export const VERSION = __APP_VERSION__;
/**
 * ISO 8601 with the author's UTC offset, baked at build time from git:
 * BORN is the repository's root commit, UPDATED is HEAD. vite.config.ts
 * refuses to build from a shallow clone, where the root commit is not known.
 */
export const BORN = __BUILD_BORN__;
export const UPDATED = __BUILD_UPDATED__;

/**
 * "21 Sep 2026, 11:53 (UTC−04:00)". Shown in the offset it was committed in,
 * not converted to the reader's zone: a birth time is where it happened.
 */
export function fmtStamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const off = m[6] === "Z" ? "UTC" : `UTC${m[6].replace("-", "−")}`;
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]} (${off})`;
}
