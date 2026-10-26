import { describe, expect, it } from "vitest";
import { groupByPart, sortDocs } from "./doctypes";

const d = (type: string, order: number) => ({ type, order });

describe("資料の並び", () => {
  it("保存されている order ではなく種類の順に並べる", () => {
    // 古い原稿の順（ペルソナが 2、要件が 3、見積もりが 10）
    const docs = [d("estimate", 10), d("personas", 2), d("requirements", 3), d("executive-summary", 1), d("risks", 11)];
    expect(sortDocs(docs).map((x) => x.type)).toEqual(["executive-summary", "requirements", "personas", "risks", "estimate"]);
  });

  it("知らない種類は最後に回す", () => {
    expect(sortDocs([d("custom", 1), d("adr", 14)]).map((x) => x.type)).toEqual(["adr", "custom"]);
  });

  it("部ごとにまとめ、資料のない部は出さない", () => {
    const groups = groupByPart(sortDocs([d("estimate", 0), d("executive-summary", 0), d("glossary", 0), d("adr", 0)]));
    expect(groups.map((g) => g.title)).toEqual(["第1部 提案の概要", "第5部 費用", "付録"]);
    expect(groups[2].docs.map((x) => x.index)).toEqual([2, 3]);
  });
});
