// ```usecase ブロック（ユースケース図）の配置を計算する。
// 左のアクターだけが使うユースケースを左の列、右のアクターだけのものを右の列、両方（またはどちらも無し）を中央の列に置き、
// アクターは自分のユースケースの高さの中央に寄せる。手で配置するので、同じ原稿なら常に同じ図になる

export type UsecaseSpec = {
  system?: string;
  actors: { id: string; name: string; note?: string; side?: "left" | "right"; color?: string }[];
  cases: { id: string; name: string; actors?: string[]; note?: string }[];
  relations?: { from: string; to: string; type: "include" | "extend" }[];
};

export const CASE_W = 200;
export const CASE_H = 60;
export const ACTOR_W = 140;
export const ACTOR_H = 96;
const COL_GAP = 56;
const ROW_GAP = 22;
const PAD_X = 36;
const PAD_TOP = 56; // システム名の分
const PAD_BOTTOM = 32;
const ACTOR_GAP = 96; // アクターとシステム境界の間
const ACTOR_MIN_GAP = 24;

// アクターの色（color を省略したとき）。ブランド色は本文の見出しなどと紛れるので使わない
const ACTOR_COLORS = ["teal", "grape", "orange", "cyan", "pink", "lime", "violet", "red"];

export type Point = { x: number; y: number };
export type UsecaseLayout = {
  boundary: { x: number; y: number; width: number; height: number };
  actors: (UsecaseSpec["actors"][number] & Point & { side: "left" | "right"; color: string })[];
  cases: (UsecaseSpec["cases"][number] & Point & { column: number })[];
};

export function layoutUsecase(spec: UsecaseSpec): UsecaseLayout {
  const side = new Map(spec.actors.map((a) => [a.id, a.side ?? "left"]));
  const columnOf = (c: UsecaseSpec["cases"][number]) => {
    const sides = new Set((c.actors ?? []).map((a) => side.get(a)));
    if (sides.size === 1) return sides.has("left") ? 0 : 2;
    return 1;
  };
  // アクターの並び順でユースケースを並べ、線が交差しにくくする
  const actorIndex = new Map(spec.actors.map((a, i) => [a.id, i]));
  const rank = (c: UsecaseSpec["cases"][number]) => Math.min(...(c.actors ?? []).map((a) => actorIndex.get(a) ?? 99), 99);
  const columns: UsecaseSpec["cases"][] = [[], [], []];
  spec.cases
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .forEach(({ c }) => columns[columnOf(c)].push(c));

  const used = columns.map((col, i) => ({ col, i })).filter((x) => x.col.length);
  const rows = Math.max(...used.map((x) => x.col.length));
  const innerH = rows * CASE_H + (rows - 1) * ROW_GAP;
  const width = PAD_X * 2 + used.length * CASE_W + (used.length - 1) * COL_GAP;
  const height = PAD_TOP + innerH + PAD_BOTTOM;
  const hasLeft = spec.actors.some((a) => (a.side ?? "left") === "left");
  const boundary = { x: hasLeft ? ACTOR_W + ACTOR_GAP : 0, y: 0, width, height };

  const cases: UsecaseLayout["cases"] = [];
  used.forEach(({ col, i }, k) => {
    const colH = col.length * CASE_H + (col.length - 1) * ROW_GAP;
    const top = boundary.y + PAD_TOP + (innerH - colH) / 2; // 短い列は上下中央に
    col.forEach((c, r) => {
      cases.push({ ...c, column: i, x: boundary.x + PAD_X + k * (CASE_W + COL_GAP), y: top + r * (CASE_H + ROW_GAP) });
    });
  });

  const centerY = new Map(cases.map((c) => [c.id, c.y + CASE_H / 2]));
  const actors: UsecaseLayout["actors"] = [];
  for (const s of ["left", "right"] as const) {
    const group = spec.actors
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => (a.side ?? "left") === s)
      .map(({ a, i }) => {
        const ys = spec.cases.filter((c) => c.actors?.includes(a.id)).map((c) => centerY.get(c.id)!);
        const y = ys.length ? ys.reduce((p, v) => p + v, 0) / ys.length : height / 2;
        return { ...a, side: s, color: a.color ?? ACTOR_COLORS[i % ACTOR_COLORS.length], x: 0, y: y - ACTOR_H / 2 };
      })
      .sort((p, q) => p.y - q.y);
    // 重ならないよう下へずらす
    for (let k = 1; k < group.length; k++) group[k].y = Math.max(group[k].y, group[k - 1].y + ACTOR_H + ACTOR_MIN_GAP);
    for (const a of group) a.x = s === "left" ? 0 : boundary.x + width + ACTOR_GAP;
    actors.push(...group);
  }
  return { boundary, actors, cases };
}
