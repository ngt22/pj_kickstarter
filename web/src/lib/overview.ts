// 表紙のサマリー（期間・費用・マイルストーン・リスク）を各ドキュメントの原稿から集計する。
// 案件ごとに数字を書き直さなくてよいよう、ロードマップのガント・見積もり・リスク管理表から読む
import { parseYaml, stripFrontMatter, type DocRecord } from "./docs";
import { estimateTotals, normalizeEstimate, taxLabel } from "./estimate";
import { schedule, type GanttSpec } from "./gantt";

export type Overview = {
  period?: { start: number; end: number; weeks: number };
  milestones: { name: string; day: number }[];
  estimate?: { months: number; initial: number; monthly?: number; currency: string; tax: string; breakdown: boolean };
  risks?: { open: number; high: number; total: number };
};

// 本文中の最初の ```gantt ブロックを取り出す
export function findGantt(markdown: string): string | undefined {
  return /```gantt\n([\s\S]*?)\n```/.exec(stripFrontMatter(markdown))?.[1];
}

export function buildOverview(docs: DocRecord[]): Overview {
  const byType = new Map(docs.map((d) => [d.type, d]));
  const result: Overview = { milestones: [] };

  const gantt = byType.get("roadmap") && findGantt(byType.get("roadmap")!.body);
  if (gantt) {
    try {
      const tasks = schedule(parseYaml<GanttSpec>(gantt));
      if (tasks.length) {
        const start = Math.min(...tasks.map((t) => t.start));
        // マイルストーンは長さ0なので、その日を含むよう1日足す（期間の最終日がマイルストーンより前にならないように）
        const end = Math.max(...tasks.map((t) => (t.milestone ? t.start + 1 : t.end)));
        result.period = { start, end, weeks: Math.ceil((end - start) / 7) };
        result.milestones = tasks.filter((t) => t.milestone).map((t) => ({ name: t.name, day: t.start }));
      }
    } catch {
      // 書き間違いはロードマップのページで表示されるので、表紙では省く
    }
  }

  const estimate = byType.get("estimate");
  if (estimate) {
    try {
      const data = normalizeEstimate(parseYaml(estimate.body));
      result.estimate = { ...estimateTotals(data), currency: data.currency, tax: taxLabel(data), breakdown: data.show_breakdown };
    } catch {
      // 同上
    }
  }

  const risks = byType.get("risks");
  if (risks) {
    try {
      const list = parseYaml<{ risks: { impact: string; probability: string; status: string }[] }>(risks.body).risks ?? [];
      const open = list.filter((r) => r.status !== "closed");
      result.risks = {
        total: list.length,
        open: open.length,
        high: open.filter((r) => r.impact === "高" || r.probability === "高").length,
      };
    } catch {
      // 同上
    }
  }
  return result;
}
