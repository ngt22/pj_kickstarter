import { describe, expect, it } from "vitest";
import { annotationText, bounds, createSmoother, flatten, normalizeTags, simplify, smoothPath, unflatten } from "./annotations";

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
