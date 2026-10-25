import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./docs";
import { ACTOR_H, ACTOR_W, CASE_H, layoutUsecase, type UsecaseSpec } from "./usecase";

const sample = readFileSync(new URL("../../../projects/sample/personas.md", import.meta.url), "utf-8");
const spec = parseYaml<UsecaseSpec>(/```usecase\n([\s\S]*?)\n```/.exec(sample)![1]);

describe("usecase", () => {
  const l = layoutUsecase(spec);
  const caseOf = (id: string) => l.cases.find((c) => c.id === id)!;
  const actorOf = (id: string) => l.actors.find((a) => a.id === id)!;

  it("左右のアクターのユースケースを別の列に置く", () => {
    expect(caseOf("UC-01").x).toBe(caseOf("UC-02").x);
    expect(caseOf("UC-05").x).toBeGreaterThan(caseOf("UC-01").x);
    expect(caseOf("UC-04").x).toBe(caseOf("UC-05").x);
  });

  it("アクターはシステム境界の外の左右に置き、重ねない", () => {
    expect(actorOf("user").x + ACTOR_W).toBeLessThan(l.boundary.x);
    expect(actorOf("staff").x).toBeGreaterThan(l.boundary.x + l.boundary.width);
    expect(Math.abs(actorOf("staff").y - actorOf("mail").y)).toBeGreaterThanOrEqual(ACTOR_H);
  });

  it("ユースケースはすべてシステム境界の中に入る", () => {
    for (const c of l.cases) {
      expect(c.y).toBeGreaterThan(l.boundary.y);
      expect(c.y + CASE_H).toBeLessThan(l.boundary.y + l.boundary.height);
    }
  });

  it("右のアクターだけなら左に余白を取らない", () => {
    const only = layoutUsecase({ actors: [{ id: "a", name: "A", side: "right" }], cases: [{ id: "c", name: "C", actors: ["a"] }] });
    expect(only.boundary.x).toBe(0);
  });
});
