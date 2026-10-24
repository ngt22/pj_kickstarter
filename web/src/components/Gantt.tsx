import { ActionIcon, Box, Button, Code, Group, Modal, SegmentedControl, Text, Title, Tooltip, useMantineTheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseYaml } from "../lib/docs";
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

const LABEL_W = 260;
const ROW_H = 34;
const HEADER_H = 52;

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

function Chart({ tasks, sectionNames, maxHeight }: { tasks: GanttTask[]; sectionNames: string[]; maxHeight: string }) {
  const first = Math.min(...tasks.map((t) => t.start));
  const last = Math.max(...tasks.map((t) => t.end));
  const [scale, setScale] = useState<Scale>(() => defaultScale(last - first));
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayDay();
  const chartColors: string[] = useMantineTheme().other.chartColors;

  // 前後に余白を取り、目盛りの切れ目にそろえる
  const pad = scale === "day" ? 3 : scale === "week" ? 14 : 45;
  const from = scale === "month" ? monthStart(first - pad) : first - pad - ((fromDay(first - pad).getUTCDay() + 6) % 7);
  const to = last + pad;
  const dw = DAY_WIDTH[scale];
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
  const color = (si: number) => chartColors[si % chartColors.length];

  return (
    <>
      <Group justify="space-between" mb="xs" gap="xs">
        <SegmentedControl
          size="xs"
          value={scale}
          onChange={(v) => setScale(v as Scale)}
          data={[
            { value: "day", label: "日" },
            { value: "week", label: "週" },
            { value: "month", label: "月" },
          ]}
        />
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => scrollToDay(today)}>今日</Button>
          <Button size="xs" variant="default" onClick={() => setClosed(new Set())}>すべて開く</Button>
          <Button size="xs" variant="default" onClick={() => setClosed(new Set(sectionNames.map((_, i) => i)))}>
            すべて閉じる
          </Button>
        </Group>
      </Group>
      <div className="gantt" ref={scrollRef} style={{ maxHeight }}>
        <div style={{ width: LABEL_W + width, position: "relative" }}>
          <div className="gantt-header" style={{ height: HEADER_H }}>
            <div className="gantt-label gantt-corner" style={{ width: LABEL_W }}>タスク</div>
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
                    <div className="gantt-label" style={{ width: LABEL_W }} onClick={() => toggle(r.section)}>
                      <ActionIcon size="xs" variant="subtle" color="gray" aria-label="開閉">
                        {closed.has(r.section) ? "▸" : "▾"}
                      </ActionIcon>
                      <Text fw={700} size="sm" truncate>{sectionNames[r.section]}</Text>
                      <Text size="xs" c="dimmed" ml="auto">{ts.length}</Text>
                    </div>
                    {ts.length > 0 && (
                      <div
                        className="gantt-summary"
                        style={{ left: LABEL_W + x(s), width: Math.max((e - s) * dw, 2), background: `var(--mantine-color-${color(r.section)}-filled)` }}
                      />
                    )}
                  </div>
                );
              }
              const t = r.task;
              const c = color(t.section);
              const barW = Math.max((t.end - t.start) * dw, 3);
              const inside = !t.milestone && barW > t.name.length * 13 + 16;
              return (
                <div key={t.key} className="gantt-row" style={{ height: ROW_H }}>
                  <div className="gantt-label" style={{ width: LABEL_W, paddingLeft: 32 }}>
                    <Text size="sm" truncate title={t.name}>{t.name}</Text>
                    {t.owner && <Text size="xs" c="dimmed" ml="auto" style={{ whiteSpace: "nowrap" }}>{t.owner}</Text>}
                  </div>
                  <Tooltip label={<TaskTooltip task={t} />} withArrow openDelay={150}>
                    {t.milestone ? (
                      <div
                        className="gantt-milestone"
                        style={{ left: LABEL_W + x(t.start) - 7, background: `var(--mantine-color-${c}-filled)` }}
                      />
                    ) : (
                      <div
                        className="gantt-bar"
                        style={{
                          left: LABEL_W + x(t.start),
                          width: barW,
                          background: `var(--mantine-color-${c}-light)`,
                          borderColor: `var(--mantine-color-${c}-filled)`,
                          color: `var(--mantine-color-${c}-light-color)`,
                        }}
                      >
                        {inside && t.name}
                        {t.progress != null && (
                          <div
                            className="gantt-progress"
                            style={{ width: `${Math.min(100, Math.max(0, t.progress))}%`, background: `var(--mantine-color-${c}-filled)` }}
                          />
                        )}
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
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--mantine-color-gray-6)" />
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
                  const x2 = x(r.task.start) - (r.task.milestone ? 7 : 0);
                  const y2 = i * ROW_H + ROW_H / 2;
                  const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 12));
                  return (
                    <path
                      key={`${d}-${r.task.key}`}
                      d={`M${x1},${y1} H${mid} V${y2} H${x2}`}
                      fill="none"
                      stroke="var(--mantine-color-gray-6)"
                      strokeWidth={1.2}
                      markerEnd="url(#gantt-arrow)"
                    />
                  );
                });
              })}
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Gantt({ source }: { source: string }) {
  const [full, { open, close }] = useDisclosure(false);
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
      <Group justify="space-between" mb="xs">
        <Title order={4}>{spec.title ?? "スケジュール"}</Title>
        <Button size="xs" variant="light" onClick={open}>全画面で見る</Button>
      </Group>
      <Chart tasks={tasks} sectionNames={sectionNames} maxHeight="70vh" />
      <Modal opened={full} onClose={close} fullScreen title={spec.title ?? "スケジュール"}>
        <Chart tasks={tasks} sectionNames={sectionNames} maxHeight="calc(100vh - 140px)" />
      </Modal>
    </Box>
  );
}
