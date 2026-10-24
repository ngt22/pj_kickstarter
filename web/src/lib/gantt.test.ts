import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYaml } from "./docs";
import { defaultScale, formatDay, schedule, type GanttSpec } from "./gantt";

const roadmap = readFileSync(new URL("../../../projects/sample/roadmap.md", import.meta.url), "utf-8");
const block = /```gantt\n([\s\S]*?)```/.exec(roadmap)![1];

describe("gantt", () => {
  it("サンプルの日程を after から計算する", () => {
    const tasks = schedule(parseYaml<GanttSpec>(block));
    const byName = Object.fromEntries(tasks.map((t) => [t.name, t]));
    expect(formatDay(byName["要件定義"].start)).toBe("2026-11-02");
    expect(formatDay(byName["基本設計"].start)).toBe("2026-11-16");
    // after が複数あるときは一番遅い先行タスクの終わりから始まる
    expect(byName["ログイン・会員登録"].start).toBe(byName["基本設計"].end);
    expect(byName["要件確定"].milestone).toBe(true);
  });

  it("end は終了日を含む", () => {
    const [t] = schedule({ sections: [{ name: "s", tasks: [{ name: "a", start: "2026-01-01", end: "2026-01-10" }] }] });
    expect(t.end - t.start).toBe(10);
  });

  it("start も after もなければ直前のタスクに続ける", () => {
    const [a, b] = schedule({ sections: [{ name: "s", tasks: [{ name: "a", start: "2026-01-01", days: 3 }, { name: "b", days: 2 }] }] });
    expect(b.start).toBe(a.end);
  });

  it("存在しない after はエラー", () => {
    expect(() => schedule({ sections: [{ name: "s", tasks: [{ name: "a", after: "x", days: 1 }] }] })).toThrow("x");
  });

  it("期間に応じて目盛りを選ぶ", () => {
    expect(defaultScale(30)).toBe("day");
    expect(defaultScale(120)).toBe("week");
    expect(defaultScale(700)).toBe("month");
  });
});
