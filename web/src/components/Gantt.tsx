import { Box, Button, Code, Group, Modal, SegmentedControl, Text, Tooltip } from "@mantine/core";
import { useDisclosure, useElementSize, useMediaQuery } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseYaml } from "../lib/docs";
import { PENDING, usePrint } from "../lib/print";
import {
  DAY_WIDTH,
  defaultScale,
  formatDay,
  fromDay,
  schedule,
  todayDay,
  toDay,
  type GanttSpec,
  type GanttTask,
  type Scale,
} from "../lib/gantt";

// 紙の工程表（Editorial）: 色を使わず、罫線と墨の線で組み、今日とマイルストーンだけ朱で示す。
// ユースケース図・ページ遷移図・ER図とは別の見た目にして、日程の資料だと一目で分かるようにする
const ROW_H = 36;
const HEADER_H = 72;

type Tick = { day: number; label: string };

function addMonths(day: number, n: number): number {
  const d = fromDay(day);
  return toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

function monthStart(day: number): number {
  return addMonths(day, 0);
}

// 上段（大きい区切り）と下段（目盛り）の位置と文字
function ticks(from: number, to: number, scale: Scale): { top: Tick[]; bottom: Tick[] } {
  const top: Tick[] = [];
  const bottom: Tick[] = [];
  if (scale === "month") {
    for (let d = monthStart(from); d < to; d = addMonths(d, 1)) {
      const date = fromDay(d);
      if (date.getUTCMonth() === 0 || top.length === 0) top.push({ day: Math.max(d, from), label: `${date.getUTCFullYear()}年` });
      bottom.push({ day: d, label: `${date.getUTCMonth() + 1}月` });
    }
    return { top, bottom };
  }
  for (let d = monthStart(from); d < to; d = addMonths(d, 1)) {
    const date = fromDay(d);
    top.push({ day: Math.max(d, from), label: `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月` });
  }
  for (let d = from; d < to; d++) {
    const date = fromDay(d);
    if (scale === "day") bottom.push({ day: d, label: String(date.getUTCDate()) });
    else if (date.getUTCDay() === 1) bottom.push({ day: d, label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}` });
  }
  return { top, bottom };
}

function TaskTooltip({ task }: { task: GanttTask }) {
  return (
    <div>
      <Text fw={700} size="sm">{task.name}</Text>
      <Text size="xs">
        {task.milestone ? formatDay(task.start) : `${formatDay(task.start)} 〜 ${formatDay(task.end - 1)}（${task.end - task.start}日）`}
      </Text>
      {task.owner && <Text size="xs">担当: {task.owner}</Text>}
      {task.progress != null && <Text size="xs">進捗: {task.progress}%</Text>}
    </div>
  );
}

const SCALES: Scale[] = ["day", "week", "month"];

function Chart({ tasks, sectionNames, maxHeight }: { tasks: GanttTask[]; sectionNames: string[]; maxHeight: string }) {
  const first = Math.min(...tasks.map((t) => t.start));
  const last = Math.max(...tasks.map((t) => t.end));
  const [chosen, setScale] = useState<Scale>(() => defaultScale(last - first));
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayDay();
  const print = usePrint();
  const { ref: fitRef, width: avail } = useElementSize();
  const LABEL_W = useMediaQuery("(max-width: 48em)") && !print ? 150 : 260;

  // 前後に余白を取り、目盛りの切れ目にそろえる
  const span = (s: Scale) => {
    const pad = s === "day" ? 3 : s === "week" ? 14 : 45;
    const from = s === "month" ? monthStart(first - pad) : first - pad - ((fromDay(first - pad).getUTCDay() + 6) % 7);
    return { from, to: last + pad };
  };
  // PDF ではスクロールできないので、期間を紙の幅いっぱいに伸び縮みさせる。
  // 縮めすぎると目盛りの文字が重なるので、そのときは一段粗い目盛りにする
  const fitWidth = (s: Scale) => {
    const r = span(s);
    return (avail - LABEL_W) / (r.to - r.from);
  };
  const scale = print
    ? (SCALES.slice(SCALES.indexOf(defaultScale(last - first))).find((s) => fitWidth(s) >= DAY_WIDTH[s] * 0.6) ?? "month")
    : chosen;
  const { from, to } = span(scale);
  const dw = print ? fitWidth(scale) : DAY_WIDTH[scale];
  const width = (to - from) * dw;
  const x = (day: number) => (day - from) * dw;
  const { top, bottom } = useMemo(() => ticks(from, to, scale), [from, to, scale]);

  // 表示する行（セクション見出し + 開いているセクションのタスク）
  const rows: ({ kind: "section"; section: number } | { kind: "task"; task: GanttTask })[] = [];
  sectionNames.forEach((_, si) => {
    rows.push({ kind: "section", section: si });
    if (!closed.has(si)) tasks.filter((t) => t.section === si).forEach((task) => rows.push({ kind: "task", task }));
  });
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.kind === "task" && r.task.id && rowOf.set(r.task.id, i));

  const scrollToDay = (day: number) => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, x(day) - 2 * dw * (scale === "day" ? 3 : 7));
  };
  useEffect(() => {
    scrollToDay(today >= first && today <= last ? today : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const toggle = (si: number) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(si)) next.delete(si);
      else next.add(si);
      return next;
    });

  const bodyH = rows.length * ROW_H;

  if (print && !avail) return <div ref={fitRef} {...PENDING} />;
  return (
    <div ref={fitRef}>
      {!print && (
      <Group justify="space-between" mb="xs" gap="xs">
        <SegmentedControl
          size="xs"
          className="gantt-scale"
          value={scale}
          onChange={(v) => setScale(v as Scale)}
          data={[
            { value: "day", label: "日" },
            { value: "week", label: "週" },
            { value: "month", label: "月" },
          ]}
        />
        <Group gap="xs">
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => scrollToDay(today)}>今日</Button>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setClosed(new Set())}>すべて開く</Button>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setClosed(new Set(sectionNames.map((_, i) => i)))}>
            すべて閉じる
          </Button>
        </Group>
      </Group>
      )}
      <div className="gantt" ref={scrollRef} style={{ maxHeight: print ? undefined : maxHeight }}>
        <div style={{ width: LABEL_W + width, position: "relative" }}>
          <div className="gantt-header" style={{ height: HEADER_H }}>
            <div className="gantt-label gantt-corner" style={{ width: LABEL_W }}>工程</div>
            <div style={{ position: "relative", width, height: HEADER_H }}>
              {top.map((t) => (
                <div key={`t${t.day}`} className="gantt-tick gantt-tick-top" style={{ left: x(t.day) }}>{t.label}</div>
              ))}
              {bottom.map((t) => (
                <div
                  key={`b${t.day}`}
                  className="gantt-tick gantt-tick-bottom"
                  style={{ left: x(t.day), width: scale === "day" ? dw : undefined }}
                >
                  {t.label}
                </div>
              ))}
              {today >= from && today <= to && (
                <div className="gantt-today-tag" style={{ left: x(today) + dw / 2 }}>今日</div>
              )}
            </div>
          </div>

          <div style={{ position: "relative", height: bodyH }}>
            {/* 背景: 目盛り線・土日・今日 */}
            <div className="gantt-grid" style={{ left: LABEL_W, width, height: bodyH }}>
              {scale === "day" &&
                Array.from({ length: to - from }, (_, i) => from + i)
                  .filter((d) => [0, 6].includes(fromDay(d).getUTCDay()))
                  .map((d) => <div key={d} className="gantt-weekend" style={{ left: x(d), width: dw }} />)}
              {bottom.map((t) => <div key={t.day} className="gantt-line" style={{ left: x(t.day) }} />)}
              {today >= from && today <= to && <div className="gantt-today" style={{ left: x(today) + dw / 2 }} />}
            </div>

            {rows.map((r, i) => {
              if (r.kind === "section") {
                const ts = tasks.filter((t) => t.section === r.section);
                const s = Math.min(...ts.map((t) => t.start));
                const e = Math.max(...ts.map((t) => t.end));
                return (
                  <div key={`s${r.section}`} className="gantt-row gantt-section" style={{ height: ROW_H }}>
                    <div
                      className="gantt-label"
                      style={{ width: LABEL_W }}
                      role="button"
                      aria-expanded={!closed.has(r.section)}
                      onClick={() => toggle(r.section)}
                    >
                      <span className="gantt-sec-mark">§</span>
                      <span className="gantt-sec-name">{sectionNames[r.section]}</span>
                      <span className="gantt-sec-count">
                        {ts.length}件 {closed.has(r.section) ? "＋" : "−"}
                      </span>
                    </div>
                    {ts.length > 0 && (
                      <div className="gantt-summary" style={{ left: LABEL_W + x(s), width: Math.max((e - s) * dw, 2) }}>
                        <span className="gantt-summary-dates">
                          {formatDay(s)} – {formatDay(e - 1)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }
              const t = r.task;
              const barW = Math.max((t.end - t.start) * dw, 3);
              const inside = !t.milestone && barW > t.name.length * 13 + 16;
              return (
                <div key={t.key} className="gantt-row" style={{ height: ROW_H }}>
                  <div className="gantt-label gantt-task-label" style={{ width: LABEL_W }}>
                    <Text size="sm" truncate title={t.name}>{t.name}</Text>
                    {t.owner && <span className="gantt-owner">{t.owner}</span>}
                  </div>
                  <Tooltip label={<TaskTooltip task={t} />} withArrow openDelay={150}>
                    {t.milestone ? (
                      <div className="gantt-milestone" style={{ left: LABEL_W + x(t.start) - 6 }} />
                    ) : (
                      <div
                        className="gantt-bar"
                        data-done={t.progress === 100 || undefined}
                        style={{ left: LABEL_W + x(t.start), width: barW }}
                      >
                        {t.progress != null && (
                          <div className="gantt-progress" style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }} />
                        )}
                        {inside && <span className="gantt-bar-text">{t.name}</span>}
                      </div>
                    )}
                  </Tooltip>
                  {!inside && (
                    <div className="gantt-outside" style={{ left: LABEL_W + x(t.milestone ? t.start : t.end) + (t.milestone ? 12 : 6) }}>
                      {t.name}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 依存関係の矢印 */}
            <svg className="gantt-deps" style={{ left: LABEL_W }} width={width} height={bodyH}>
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--ed-muted)" />
                </marker>
              </defs>
              {rows.map((r, i) => {
                if (r.kind !== "task") return null;
                return r.task.deps.map((d) => {
                  const j = rowOf.get(d);
                  const dep = tasks.find((t) => t.id === d);
                  if (j == null || !dep) return null;
                  const x1 = x(dep.end);
                  const y1 = j * ROW_H + ROW_H / 2;
                  const x2 = x(r.task.start) - (r.task.milestone ? 9 : 0);
                  const y2 = i * ROW_H + ROW_H / 2;
                  const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 12));
                  return (
                    <path
                      key={`${d}-${r.task.key}`}
                      d={`M${x1},${y1} H${mid} V${y2} H${x2}`}
                      fill="none"
                      stroke="var(--ed-muted)"
                      strokeWidth={1}
                      markerEnd="url(#gantt-arrow)"
                    />
                  );
                });
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Gantt({ source }: { source: string }) {
  const [full, { open, close }] = useDisclosure(false);
  const print = usePrint();
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<GanttSpec>(source);
      return { spec, tasks: schedule(spec) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);

  if ("error" in parsed) return <Code block c="red">ガントチャートを読めません: {parsed.error}</Code>;
  const { spec, tasks } = parsed;
  if (!tasks.length) return null;
  const sectionNames = spec.sections.map((s) => s.name);

  return (
    <Box className="gantt-wrap" my="md">
      <header className="gantt-head">
        <div>
          <div className="gantt-kicker">Schedule</div>
          <div className="gantt-title">{spec.title ?? "スケジュール"}</div>
        </div>
        {!print && <Button size="compact-xs" variant="subtle" color="gray" onClick={open}>全画面で見る</Button>}
      </header>
      <Chart tasks={tasks} sectionNames={sectionNames} maxHeight="70vh" />
      <Modal opened={full} onClose={close} fullScreen title={spec.title ?? "スケジュール"} classNames={{ body: "gantt-wrap" }}>
        <Chart tasks={tasks} sectionNames={sectionNames} maxHeight="calc(100vh - 140px)" />
      </Modal>
    </Box>
  );
}
