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

  it("合計の人月は小数の誤差を出さない", () => {
    const e = normalizeEstimate(
      parseYaml("initial:\n  unit_price: 1000000\n  items:\n    - { phase: a, task: a, person_months: 0.3 }\n    - { phase: b, task: b, person_months: 0.3 }\n    - { phase: c, task: c, person_months: 1.2 }\n    - { phase: d, task: d, person_months: 0.3 }"),
    );
    expect(estimateTotals(e).months).toBe(2.1);
  });

  it("金額の直接指定・月額のリスト・オプション・内訳を隠す指定を読む", () => {
    const e = normalizeEstimate(
      parseYaml(
        "show_breakdown: false\ninitial:\n  unit_price: 800000\n  items:\n    - { phase: 開発, task: アプリ, amount: 1200000 }\n    - { phase: 導入, task: 説明, person_months: 0.5 }\nmonthly:\n  - { name: 保守, amount: 30000 }\noptions:\n  - { name: PDF 出力, amount: 200000 }",
      ),
    );
    expect(estimateTotals(e)).toEqual({ months: 0.5, initial: 1600000, monthly: 30000 });
    expect(e.show_breakdown).toBe(false);
    expect(e.options).toHaveLength(1);
  });
});
