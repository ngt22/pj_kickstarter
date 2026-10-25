import { describe, expect, it } from "vitest";
import { annotationText, bounds, createSmoother, flatten, formatForPrompt, memoAttach, normalizeTags, placeMemo, simplify, smoothPath, unflatten } from "./annotations";

describe("ペンの線", () => {
  it("滑らかさを上げるほど点を間引く", () => {
    const raw = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i / 5) * 10 }));
    const count = (s: number) => {
      const sm = createSmoother(raw[0], s);
      raw.slice(1).forEach((p) => sm.push(p));
      return sm.points.length;
    };
    expect(count(0)).toBeGreaterThan(count(0.5));
    expect(count(0.5)).toBeGreaterThan(count(1));
  });

  it("指を離した位置まで線が届く", () => {
    const sm = createSmoother({ x: 0, y: 0 }, 1);
    for (let x = 1; x <= 50; x++) sm.push({ x, y: 0 });
    sm.finish({ x: 50, y: 0 });
    expect(sm.points.at(-1)).toEqual({ x: 50, y: 0 });
  });

  it("手ぶれ（細かいジグザグ）を抑える", () => {
    const raw = Array.from({ length: 200 }, (_, i) => ({ x: i, y: i % 2 ? 3 : -3 }));
    const sm = createSmoother(raw[0], 0.8);
    raw.slice(1).forEach((p) => sm.push(p));
    const inner = sm.points.slice(3);
    expect(Math.max(...inner.map((p) => Math.abs(p.y)))).toBeLessThan(3);
  });

  it("直線上の点は両端だけ残す", () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i * 2 }));
    expect(simplify(line)).toEqual([line[0], line[19]]);
  });

  it("曲線は中点を通る 2 次ベジェにする", () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe("M0 0Q10 0 10 5L10 10");
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M1 2l0.01 0");
  });

  it("点の列を平らな配列にして戻せる（小数 1 桁に丸める）", () => {
    expect(flatten([{ x: 1.234, y: 5.678 }])).toEqual([1.2, 5.7]);
    expect(unflatten([1, 2, 3, 4])).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });
});

describe("付箋の中身", () => {
  it("全体を囲む矩形を求める", () => {
    expect(
      bounds([
        { kind: "box", color: "red", x: 10, y: 10, w: 50, h: 20, text: "" },
        { kind: "line", color: "red", points: [0, 40, 30, 5] },
      ]),
    ).toEqual({ x: 0, y: 5, w: 60, h: 35 });
    expect(bounds([])).toBeNull();
  });

  it("ハッシュタグの # と重複を取り除く", () => {
    expect(normalizeTags(["#文言", "＃文言", " 要確認 ", "", "##"])).toEqual(["文言", "要確認"]);
  });

  it("一覧の本文は囲みの文字と補足をつなぐ", () => {
    const items = [
      { kind: "box" as const, color: "red" as const, x: 0, y: 0, w: 1, h: 1, text: "ここを直す" },
      { kind: "pen" as const, color: "red" as const, width: 3, points: [] },
    ];
    expect(annotationText({ items, comment: "急ぎ" })).toBe("ここを直す — 急ぎ");
    expect(annotationText({ items: [], comment: "" })).toBe("");
  });
});

describe("メモと書き出し", () => {
  it("メモ欄は点の右上に置き、右端・上端では左・下へ折り返す", () => {
    expect(placeMemo({ x: 100, y: 200 }, 800)).toEqual({ x: 128, y: 108 });
    expect(placeMemo({ x: 700, y: 200 }, 800)).toEqual({ x: 452, y: 108 });
    expect(placeMemo({ x: 100, y: 10 }, 800)).toEqual({ x: 128, y: 38 });
  });

  it("引出線は点にいちばん近いメモ欄の縁につなぐ", () => {
    const m = { kind: "memo" as const, color: "red" as const, px: 100, py: 200, x: 128, y: 108, w: 220, h: 64, text: "" };
    expect(memoAttach(m)).toEqual({ x: 128, y: 172 }); // 左下の角
    expect(memoAttach({ ...m, h: 120 })).toEqual({ x: 128, y: 200 }); // 下に伸ばしたら左の縁
    expect(bounds([m])).toEqual({ x: 100, y: 108, w: 248, h: 92 });
  });

  it("メモごとに指示と指している要素を Markdown にする", () => {
    const target = { selector: "div.doc-body > table:nth-of-type(1) > tbody > tr:nth-of-type(2) > td:nth-of-type(2)", section: "機能要件", text: "利用者は会員登録なしで予約できる", rx: 23, ry: 50 };
    const memo = (text: string) => ({ kind: "memo" as const, color: "red" as const, px: 0, py: 0, x: 0, y: 0, w: 1, h: 1, text, target });
    const a = {
      id: "x",
      docType: "requirements",
      authorUid: "u",
      authorName: "ノブ",
      authorEmail: "n@example.com",
      items: [memo("電話番号だけで予約できる意味ですか"), memo("本人確認の方法も書く")],
      comment: "急ぎ",
      tags: ["仕様確認"],
      status: "open" as const,
      anchor: { path: [], left: 0, top: 0 },
      width: 800,
    };
    const md = formatForPrompt([a], { projectName: "サンプル案件", pageTitles: { requirements: "要件定義書" }, pageUrl: (t) => `https://x/projects/s/${t}` });
    expect(md).toContain("## 1. 要件定義書");
    expect(md).toContain("- 指示: 電話番号だけで予約できる意味ですか\n  - 指している箇所: 見出し「機能要件」の中、「利用者は会員登録なしで予約できる」（要素内 23%, 50% の位置");
    expect(md).toContain("- 指示: 本人確認の方法も書く");
    expect(md).toContain("- 補足: 急ぎ");
    expect(annotationText(a)).toBe("電話番号だけで予約できる意味ですか / 本人確認の方法も書く — 急ぎ");
  });
});
