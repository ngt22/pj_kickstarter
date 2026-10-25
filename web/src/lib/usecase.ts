// ```usecase ブロック（ユースケース図）を、区画 → アクターの段 → ユースケースのカードの順に組み立てる。
// 線で結ぶ代わりに「誰の段に並んでいるか」で関係を表すので、ユースケースが増えても配線が絡まない

export type UsecaseSpec = {
  system?: string;
  zones?: { id: string; name: string; note?: string; color?: string }[];
  actors: {
    id: string;
    name: string;
    note?: string;
    zone?: string;
    kind?: "person" | "system";
    inherits?: string;
    color?: string;
    side?: "left" | "right"; // 旧形式。並びには使わない
  }[];
  cases: { id: string; name: string; actors?: string[]; note?: string; condition?: string }[];
  relations?: { from: string; to: string; type: "include" | "extend" }[];
  flows?: { from: string; to: string; label: string; note?: string }[];
};

// 色を省略したときの順番。ブランド色は本文の見出しなどと紛れるので使わない
const COLORS = ["teal", "blue", "grape", "orange", "cyan", "pink", "lime", "violet"];

export type UsecaseCase = UsecaseSpec["cases"][number] & {
  color: string;
  others: string[]; // 一緒に使う他のアクター名
  includes: string[];
  extends: string[];
};
export type UsecaseRow = {
  actor?: UsecaseSpec["actors"][number] & { color: string; inheritsName?: string };
  cases: UsecaseCase[];
};
export type UsecaseZone = { id: string; name: string; note?: string; color: string; rows: UsecaseRow[] };
export type UsecaseFlow = { label: string; note?: string; up: boolean };
export type UsecaseView = { zones: (UsecaseZone & { flowAfter?: UsecaseFlow })[]; hasCondition: boolean };

export function buildUsecase(spec: UsecaseSpec): UsecaseView {
  const zoneSpecs = spec.zones?.length ? spec.zones : [{ id: "", name: spec.system ?? "システム" }];
  const zoneIds = zoneSpecs.map((z) => z.id);
  const zoneOf = (a: UsecaseSpec["actors"][number]) => (a.zone && zoneIds.includes(a.zone) ? a.zone : zoneIds[0]);

  const actorColor = new Map(spec.actors.map((a, i) => [a.id, a.color ?? COLORS[i % COLORS.length]]));
  const actorName = new Map(spec.actors.map((a) => [a.id, a.name]));
  const rel = (from: string, type: string) => (spec.relations ?? []).filter((r) => r.from === from && r.type === type).map((r) => r.to);

  // ユースケースは最初に書いたアクターの段に置く
  const rows = new Map<string, UsecaseCase[]>();
  for (const c of spec.cases) {
    const owner = c.actors?.find((a) => actorName.has(a)) ?? "";
    const list = rows.get(owner) ?? [];
    list.push({
      ...c,
      color: actorColor.get(owner) ?? "gray",
      others: (c.actors ?? []).filter((a) => a !== owner).map((a) => actorName.get(a) ?? a),
      includes: rel(c.id, "include"),
      extends: rel(c.id, "extend"),
    });
    rows.set(owner, list);
  }

  const zones: UsecaseView["zones"] = zoneSpecs.map((z, i) => {
    const zoneRows: UsecaseRow[] = spec.actors
      .filter((a) => zoneOf(a) === z.id)
      .map((a) => ({
        actor: { ...a, color: actorColor.get(a.id)!, inheritsName: a.inherits ? actorName.get(a.inherits) : undefined },
        cases: rows.get(a.id) ?? [],
      }));
    // アクターのいないユースケースは最初の区画の最後に並べる
    if (i === 0 && rows.get("")?.length) zoneRows.push({ cases: rows.get("")! });
    const first = zoneRows.find((r) => r.actor)?.actor;
    return { id: z.id, name: z.name, note: z.note, color: z.color ?? first?.color ?? COLORS[i % COLORS.length], rows: zoneRows };
  });

  // 区画の間の受け渡し（同期など）は、上の区画の下に帯として描く
  for (const f of spec.flows ?? []) {
    const a = zoneIds.indexOf(f.from);
    const b = zoneIds.indexOf(f.to);
    if (a < 0 || b < 0 || Math.abs(a - b) !== 1) continue;
    zones[Math.min(a, b)].flowAfter = { label: f.label, note: f.note, up: b < a };
  }
  return { zones, hasCondition: spec.cases.some((c) => c.condition) };
}
