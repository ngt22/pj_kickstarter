import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./docs";
import { buildErModel, matchesQuery, neighbors, type ErSpec } from "./er";

const md = readFileSync(new URL("../../../projects/sample/er-diagram.md", import.meta.url), "utf-8");
const block = /```er\n([\s\S]*?)```/.exec(md)![1];

describe("er", () => {
  const model = buildErModel(parseYaml<ErSpec>(block));

  it("外部キーからリレーションを作る", () => {
    const r = model.relations.find((x) => x.id === "reservation.slot_id")!;
    expect(r).toMatchObject({ from: "reservation", to: "slot", toColumn: "id", oneToOne: false });
    expect(model.relations.find((x) => x.id === "customer_profile.customer_id")!.oneToOne).toBe(true);
    expect(model.relations.find((x) => x.id === "slot.staff_id")!.optional).toBe(true);
  });

  it("隣接テーブルを求める", () => {
    expect([...neighbors(model, "slot")].sort()).toEqual(["menu", "reservation", "slot", "staff"]);
  });

  it("列名でも検索できる", () => {
    expect(model.tables.filter((t) => matchesQuery(t, "email")).map((t) => t.name)).toEqual(["customer"]);
  });

  it("参照先がなければエラー", () => {
    expect(() => buildErModel({ tables: [{ name: "a", columns: [{ name: "b_id", fk: "b" }] }] })).toThrow("b");
  });

  it("domain を書かないテーブルは未分類にまとめる", () => {
    const m = buildErModel({ tables: [{ name: "a", columns: [{ name: "id", pk: true }] }] });
    expect(m.domains.map((d) => d.name)).toEqual(["未分類"]);
  });
});
