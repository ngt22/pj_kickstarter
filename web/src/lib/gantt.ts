// ```gantt ブロック（YAML）を日付の確定したタスク一覧に変換する。描画は components/Gantt.tsx
//
// 日付はすべて「1970-01-01 からの日数」で扱う（タイムゾーンの影響を受けないため）。
// タスクは [start, end) の半開区間。days: 14 なら start から14日間を占める。

export type GanttTaskSpec = {
  id?: string;
  name: string;
  start?: string | Date;
  after?: string | string[];
  days?: number;
  end?: string | Date; // 終了日（その日を含む）
  milestone?: boolean;
  progress?: number; // 0〜100
  owner?: string;
};

export type GanttSpec = {
  title?: string;
  start?: string | Date; // 最初のタスクの既定の開始日
  sections: { name: string; tasks: GanttTaskSpec[] }[];
};

export type GanttTask = {
  key: string;
  id?: string;
  name: string;
  section: number;
  start: number;
  end: number;
  milestone: boolean;
  progress?: number;
  owner?: string;
  deps: string[];
};

const DAY_MS = 86_400_000;

export function toDay(v: string | Date): number {
  if (v instanceof Date) return Math.floor(v.getTime() / DAY_MS);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) throw new Error(`日付は YYYY-MM-DD で書いてください: ${v}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
}

export function fromDay(day: number): Date {
  return new Date(day * DAY_MS);
}

export function formatDay(day: number): string {
  return fromDay(day).toISOString().slice(0, 10);
}

export function todayDay(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}

export function schedule(spec: GanttSpec): GanttTask[] {
  if (!spec?.sections?.length) throw new Error("sections がありません");
  const tasks: GanttTask[] = [];
  const byId = new Map<string, GanttTask>();
  let cursor = spec.start != null ? toDay(spec.start) : undefined;

  spec.sections.forEach((section, si) => {
    (section.tasks ?? []).forEach((t, ti) => {
      const deps = t.after == null ? [] : Array.isArray(t.after) ? t.after : [t.after];
      let start: number;
      if (t.start != null) {
        start = toDay(t.start);
      } else if (deps.length) {
        start = Math.max(
          ...deps.map((d) => {
            const dep = byId.get(d);
            if (!dep) throw new Error(`「${t.name}」の after: ${d} が見つかりません（先に書かれたタスクの id を指定してください）`);
            return dep.end;
          }),
        );
      } else if (tasks.length) {
        start = tasks[tasks.length - 1].end; // 直前のタスクに続ける
      } else if (cursor != null) {
        start = cursor;
      } else {
        throw new Error(`「${t.name}」の開始日がありません（start か after を書いてください）`);
      }

      const milestone = !!t.milestone;
      let end: number;
      if (milestone) end = start;
      else if (t.end != null) end = toDay(t.end) + 1;
      else if (t.days != null) end = start + t.days;
      else throw new Error(`「${t.name}」の期間がありません（days か end を書いてください）`);
      if (end < start) throw new Error(`「${t.name}」の終了日が開始日より前です`);

      const task: GanttTask = {
        key: t.id ?? `${si}-${ti}`,
        id: t.id,
        name: t.name,
        section: si,
        start,
        end,
        milestone,
        progress: t.progress,
        owner: t.owner,
        deps,
      };
      if (t.id) {
        if (byId.has(t.id)) throw new Error(`id が重複しています: ${t.id}`);
        byId.set(t.id, task);
      }
      tasks.push(task);
      cursor = end;
    });
  });
  return tasks;
}

export type Scale = "day" | "week" | "month";

// 1日あたりの横幅（px）
export const DAY_WIDTH: Record<Scale, number> = { day: 28, week: 10, month: 3.5 };

// 全体の長さから、最初に表示する目盛りを決める
export function defaultScale(totalDays: number): Scale {
  if (totalDays <= 45) return "day";
  if (totalDays <= 240) return "week";
  return "month";
}
