import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateTotal } from "../components/YamlViews";
import { parseYaml, stripFrontMatter } from "./docs";

const sample = (name: string) => readFileSync(new URL(`../../../projects/sample/${name}`, import.meta.url), "utf-8");

describe("docs", () => {
  it("front matter を取り除く", () => {
    const body = stripFrontMatter(sample("requirements.md"));
    expect(body.startsWith("## 目的")).toBe(true);
  });

  it("front matter がなければそのまま返す", () => {
    expect(stripFrontMatter("# 見出し")).toBe("# 見出し");
  });

  it("見積もりの合計を計算する", () => {
    const data = parseYaml<Parameters<typeof estimateTotal>[0]>(sample("estimate.yaml"));
    expect(estimateTotal(data)).toEqual({ months: 3, amount: 2400000 });
  });
});
