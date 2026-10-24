import { describe, expect, it } from "vitest";
import { oklch, ramp } from "./palette";

describe("palette", () => {
  it("10 段階の色コードを返す", () => {
    const r = ramp(268, 0.15);
    expect(r).toHaveLength(10);
    for (const c of r) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("段階が進むほど暗くなる", () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const r = ramp(25, 0.16);
    for (let i = 1; i < r.length; i++) expect(lum(r[i])).toBeLessThan(lum(r[i - 1]));
  });

  it("無彩色は白と黒になる", () => {
    expect(oklch(1, 0, 0)).toBe("#ffffff");
    expect(oklch(0, 0, 0)).toBe("#000000");
  });
});
