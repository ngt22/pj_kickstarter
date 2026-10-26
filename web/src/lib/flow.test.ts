import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./docs";
import { layoutFlow, SCREEN_DIMS, type FlowSpec } from "./flow";

const sample = readFileSync(new URL("../../../projects/sample/page-flow.md", import.meta.url), "utf-8");
const spec = parseYaml<FlowSpec>(/```flow\n([\s\S]*?)\n```/.exec(sample)![1]);

describe("layoutFlow", async () => {
  const l = await layoutFlow(spec);
  const lane = (zone: string, i = 0) => l.zones.find((z) => z.id === zone)!.lanes[i];
  const node = (zone: string, id: string, i = 0) => lane(zone, i).nodes.find((n) => n.id === id)!;

  it("区画・レーンごとに画面を分け、遷移の順に左から右へ並べる", () => {
    expect(l.zones.map((z) => z.lanes.length)).toEqual([1, 2]);
    const xs = ["start", "SC-01", "SC-02", "SC-03", "SC-04"].map((id) => node("customer", id).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(node("customer", "SC-02").x - node("customer", "SC-01").x).toBeGreaterThanOrEqual(SCREEN_DIMS.cardW);
  });

  it("戻る線はカードの下をくぐり、開始・終了の丸を見分ける", () => {
    const back = lane("customer").edges.find((e) => e.back)!;
    expect(back.label).toBe("修正する");
    expect(back.ly).toBeGreaterThan(node("customer", "SC-02").y + node("customer", "SC-02").h);
    expect(node("customer", "start").role).toBe("start");
    expect(node("store", "visit").role).toBe("end");
  });

  it("区画の間の受け渡しと、レーンの補足を読み取る", () => {
    expect(l.zones[0].flowAfter).toMatchObject({ label: "予約がすぐ店舗に届く", up: false });
    expect(lane("store", 1).note).toContain("独立した設定画面");
    expect(l.hasBack).toBe(true);
  });
});
