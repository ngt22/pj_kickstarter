import { describe, expect, it } from "vitest";
import { collectNotes, collectTransitions, excludeMock, splitShell } from "./mock";

const body = [
  { header: { title: "予約", actions: [{ label: "ログイン", to: "SC-10" }] } },
  { nav: { items: ["ホーム", { label: "予約一覧", to: "SC-11" }], note: 1 } },
  { row: [{ input: { label: "日付", note: 3 } }, { select: { label: "メニュー", note: 2 } }] },
  { table: { columns: ["時間"], rows: [], note: 10 } },
  { buttons: [{ label: "戻る", to: "SC-01" }, { label: "戻る", to: "SC-01" }] },
  { list: [{ title: "全身整体", to: "SC-05" }] },
  { tabbar: ["ホーム", "予約"] },
];

describe("collectNotes", () => {
  it("入れ子の部品も拾い、番号順に並べ、名前のない部品は種類名で補う", () => {
    expect(collectNotes(body)).toEqual([
      { n: "1", label: "メニュー" },
      { n: "2", label: "メニュー" },
      { n: "3", label: "日付" },
      { n: "10", label: "一覧表" },
    ]);
  });
});

describe("collectTransitions", () => {
  it("ヘッダー・メニュー・ボタン・一覧の遷移先を重複なく集める", () => {
    expect(collectTransitions(body)).toEqual([
      { label: "ログイン", to: "SC-10" },
      { label: "予約一覧", to: "SC-11" },
      { label: "戻る", to: "SC-01" },
      { label: "全身整体", to: "SC-05" },
    ]);
  });
});

describe("splitShell", () => {
  it("先頭の header・nav・tabbar を骨組みに分ける", () => {
    const shell = splitShell(body);
    expect(shell.header).toBe(body[0]);
    expect(shell.nav).toBe(body[1]);
    expect(shell.tabbar).toBe(body[6]);
    expect(shell.main).toHaveLength(4);
  });

  it("先頭以外の header は本文として扱う", () => {
    expect(splitShell([{ heading: "a" }, { header: "b" }]).header).toBeUndefined();
  });
});

describe("excludeMock", () => {
  it("ダーク用のセレクターだけに条件を足し、疑似要素の前に差し込む", () => {
    expect(excludeMock(':where([data-mantine-color-scheme="dark"]) .m_a, .m_b:where(:not([x], [y]))')).toBe(
      ':where([data-mantine-color-scheme="dark"]) .m_a:where(:not(.mock-app *)), .m_b:where(:not([x], [y]))',
    );
    expect(excludeMock('[data-mantine-color-scheme="dark"] .m_a::before')).toBe(
      '[data-mantine-color-scheme="dark"] .m_a:where(:not(.mock-app *))::before',
    );
  });
});
