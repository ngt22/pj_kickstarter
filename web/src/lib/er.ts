// ```er ブロック（YAML）を正規化し、外部キーからリレーションを導く。描画は components/ErDiagram.tsx

export type ErColumnSpec = {
  name: string;
  type?: string;
  pk?: boolean;
  fk?: string; // "テーブル名" または "テーブル名.列名"（列名を省くと主キー）
  unique?: boolean; // fk と併用すると 1対1
  nullable?: boolean;
  note?: string;
};

export type ErTableSpec = {
  name: string;
  label?: string;
  domain?: string;
  note?: string;
  columns: ErColumnSpec[];
};

export type ErSpec = {
  domains?: { id: string; name?: string; color?: string }[];
  tables: ErTableSpec[];
};

export type ErDomain = { id: string; name: string; color: string };

export type ErRelation = {
  id: string;
  from: string; // 外部キーを持つテーブル（多側）
  fromColumn: string;
  to: string; // 参照先テーブル（1側）
  toColumn: string;
  oneToOne: boolean;
  optional: boolean;
};

export type ErModel = {
  domains: ErDomain[];
  tables: (ErTableSpec & { domain: string })[];
  relations: ErRelation[];
};

const COLORS = ["blue", "teal", "grape", "orange", "indigo", "pink", "cyan", "lime", "red", "violet", "yellow", "green"];
const NO_DOMAIN = "_";

export function buildErModel(spec: ErSpec): ErModel {
  if (!spec?.tables?.length) throw new Error("tables がありません");
  const domains: ErDomain[] = (spec.domains ?? []).map((d, i) => ({
    id: d.id,
    name: d.name ?? d.id,
    color: d.color ?? COLORS[i % COLORS.length],
  }));
  const known = new Set(domains.map((d) => d.id));

  const tables = spec.tables.map((t) => {
    if (t.domain && !known.has(t.domain)) throw new Error(`テーブル ${t.name} の domain: ${t.domain} が domains にありません`);
    return { ...t, domain: t.domain ?? NO_DOMAIN };
  });
  if (tables.some((t) => t.domain === NO_DOMAIN)) domains.push({ id: NO_DOMAIN, name: "未分類", color: "gray" });

  const byName = new Map(tables.map((t) => [t.name, t]));
  if (byName.size !== tables.length) throw new Error("テーブル名が重複しています");

  const relations: ErRelation[] = [];
  for (const t of tables) {
    for (const c of t.columns ?? []) {
      if (!c.fk) continue;
      const [toName, toCol] = c.fk.split(".");
      const target = byName.get(toName);
      if (!target) throw new Error(`${t.name}.${c.name} の参照先 ${c.fk} がありません`);
      const toColumn = toCol ?? target.columns.find((x) => x.pk)?.name;
      if (!toColumn || !target.columns.some((x) => x.name === toColumn)) {
        throw new Error(`${t.name}.${c.name} の参照先の列 ${c.fk} がありません`);
      }
      relations.push({
        id: `${t.name}.${c.name}`,
        from: t.name,
        fromColumn: c.name,
        to: toName,
        toColumn,
        oneToOne: !!c.unique,
        optional: !!c.nullable,
      });
    }
  }
  return { domains, tables, relations };
}

// 隣接するテーブル（参照する・される）
export function neighbors(model: ErModel, table: string): Set<string> {
  const set = new Set([table]);
  for (const r of model.relations) {
    if (r.from === table) set.add(r.to);
    if (r.to === table) set.add(r.from);
  }
  return set;
}

export function matchesQuery(t: ErTableSpec, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    t.name.toLowerCase().includes(s) ||
    (t.label ?? "").toLowerCase().includes(s) ||
    t.columns.some((c) => c.name.toLowerCase().includes(s))
  );
}
