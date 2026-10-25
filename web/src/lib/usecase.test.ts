import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./docs";
import { buildUsecase, type UsecaseSpec } from "./usecase";

const sample = readFileSync(new URL("../../../projects/sample/personas.md", import.meta.url), "utf-8");
const spec = parseYaml<UsecaseSpec>(/```usecase\n([\s\S]*?)\n```/.exec(sample)![1]);

describe("buildUsecase", () => {
  const view = buildUsecase(spec);

  it("アクターを区画ごとの段に分け、ユースケースを最初のアクターの段に並べる", () => {
    expect(view.zones.map((z) => z.rows.map((r) => r.actor?.id))).toEqual([["user"], ["staff", "owner", "mail"]]);
    expect(view.zones[0].rows[0].cases.map((c) => c.id)).toEqual(["UC-01", "UC-02", "UC-03"]);
  });

  it("include・条件・引き継ぎ・区画間の受け渡しを読み取る", () => {
    const uc02 = view.zones[0].rows[0].cases[1];
    expect(uc02.includes).toEqual(["UC-01", "UC-07"]);
    expect(view.hasCondition).toBe(true);
    expect(view.zones[1].rows[1].actor?.inheritsName).toBe("店舗スタッフ");
    expect(view.zones[0].flowAfter).toMatchObject({ label: "予約がすぐ店舗に届く", up: false });
  });

  it("zones を省略した旧形式は system の名前の区画1つにまとめる", () => {
    const old = buildUsecase({
      system: "予約サービス",
      actors: [{ id: "a", name: "A", side: "right" }],
      cases: [{ id: "c", name: "C", actors: ["a"] }, { id: "d", name: "D" }],
    });
    expect(old.zones).toHaveLength(1);
    expect(old.zones[0].name).toBe("予約サービス");
    expect(old.zones[0].rows.map((r) => r.cases.map((c) => c.id))).toEqual([["c"], ["d"]]);
  });
});
