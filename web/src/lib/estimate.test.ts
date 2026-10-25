import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./docs";
import { estimateTotals, normalizeEstimate } from "./estimate";

const sample = (name: string) => readFileSync(new URL(`../../../projects/sample/${name}`, import.meta.url), "utf-8");

describe("estimate", () => {
  it("初期費用と月額費用を集計する", () => {
    const e = normalizeEstimate(parseYaml(sample("estimate.yaml")));
    expect(estimateTotals(e)).toEqual({ months: 3, initial: 2400000, monthly: 50000 });
    expect(e.valid_until).toBe("2026-11-30");
    expect(e.tax).toBe("excluded");
  });

  it("旧形式（トップレベルの items）は初期費用として読む", () => {
    const e = normalizeEstimate(
      parseYaml("unit_price: 800000\nitems:\n  - { phase: 開発, task: 予約, person_months: 0.1 }\n  - { phase: 開発, task: 管理, person_months: 0.2 }"),
    );
    expect(estimateTotals(e)).toEqual({ months: 0.3, initial: 240000, monthly: undefined });
    expect(e.monthly).toBeUndefined();
  });
});
