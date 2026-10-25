import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutArch, roundedPath, type ArchSpec } from "./arch";
import { parseYaml } from "./docs";

const sample = readFileSync(new URL("../../../projects/sample/tech-spec.md", import.meta.url), "utf-8");
const spec = parseYaml<ArchSpec>(/```arch\n([\s\S]*?)\n```/.exec(sample)![1]);

describe("layoutArch", async () => {
  const l = await layoutArch(spec);
  const node = (id: string) => l.nodes.find((n) => n.id === id)!;
  const zone = (id: string) => l.zones.find((z) => z.id === id)!;
  const link = (label: string) => l.links.find((k) => k.label === label)!;

  it("区画を上から重ね、カードは自分の区画の中に置く", () => {
    expect(l.zones.map((z) => z.id)).toEqual(["client", "cloud", "ext"]);
    expect(zone("client").y + zone("client").h).toBeLessThan(zone("cloud").y);
    for (const n of l.nodes) {
      const z = zone(spec.nodes.find((s) => s.id === n.id)!.zone!);
      expect(n.y).toBeGreaterThan(z.y);
      expect(n.y + n.h).toBeLessThan(z.y + z.h);
    }
  });

  it("区画をまたぐ線は区画の間のすき間で横に渡り、ラベルが重ならない", () => {
    const cross = ["画面を読み込む", "ログイン", "予約の読み書き"].map(link);
    const top = zone("client").y + zone("client").h;
    for (const k of cross) {
      expect(k.points[0].y).toBe(node("web").y + node("web").h);
      if (k.points.length === 4) expect(k.points[1].y).toBeGreaterThan(top);
      expect(k.points.at(-1)!.y).toBeLessThan(zone("cloud").y + zone("cloud").h);
    }
    expect(new Set(cross.map((k) => k.ly)).size).toBe(3);
  });

  it("同じ区画の中の線と、非同期の線を読み取る", () => {
    const inner = link("予約が入ったら");
    expect(inner.async).toBe(true);
    expect(inner.points[0].x).toBeLessThan(inner.points.at(-1)!.x);
    expect(l.hasAsync).toBe(true);
    expect(l.notes).toHaveLength(1);
  });
});

describe("roundedPath", () => {
  it("角を丸めた直角の線にする", () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 30, y: 20 }])).toBe("M0,0 L0,12 Q0,20 8,20 L30,20");
  });
});
