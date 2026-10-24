import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DocRecord } from "./docs";
import { formatDay } from "./gantt";
import { buildOverview, findGantt } from "./overview";

const sample = (name: string) => readFileSync(new URL(`../../../projects/sample/${name}`, import.meta.url), "utf-8");
const doc = (type: string, file: string, format: "markdown" | "yaml"): DocRecord => ({
  type,
  title: type,
  order: 0,
  format,
  body: sample(file),
});

describe("overview", () => {
  const ov = buildOverview([
    doc("roadmap", "roadmap.md", "markdown"),
    doc("estimate", "estimate.yaml", "yaml"),
    doc("risks", "risks.yaml", "yaml"),
  ]);

  it("ガントから期間とマイルストーンを集計する", () => {
    expect(formatDay(ov.period!.start)).toBe("2026-11-02");
    // 最後のマイルストーン（本番リリース）の日までを期間に含める
    expect(formatDay(ov.period!.end - 1)).toBe(formatDay(ov.milestones[2].day));
    expect(ov.milestones.map((m) => m.name)).toEqual(["要件確定", "MVP完成", "本番リリース"]);
  });

  it("見積もりとリスクを集計する", () => {
    expect(ov.estimate).toEqual({ months: 3, amount: 2400000, currency: "JPY" });
    expect(ov.risks).toEqual({ total: 2, open: 2, high: 1 });
  });

  it("ドキュメントがなければ項目を省く", () => {
    expect(buildOverview([])).toEqual({ milestones: [] });
    expect(findGantt("# なし")).toBeUndefined();
  });
});
