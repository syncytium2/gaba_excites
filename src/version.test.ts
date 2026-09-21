import { describe, expect, it } from "vitest";

// version.ts reads build-time globals; define them before importing.
Object.assign(globalThis, { __APP_VERSION__: "0.0.0", __BUILD_BORN__: "", __BUILD_UPDATED__: "" });
const { fmtStamp } = await import("./version.ts");

describe("born-on stamp", () => {
  it("keeps the commit's own offset rather than the reader's zone", () => {
    expect(fmtStamp("2026-09-21T11:53:40-04:00")).toBe("21 Sep 2026, 11:53 (UTC−04:00)");
    expect(fmtStamp("2026-01-02T03:04:05Z")).toBe("2 Jan 2026, 03:04 (UTC)");
  });
});
