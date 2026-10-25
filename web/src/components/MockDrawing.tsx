// 画面イメージの部品「drawing」: 図面（平面図）の上に、指摘などの位置をピンで打った表示。
// 図面は部屋の名前の並びから自動で描く（中廊下をはさんで上下に部屋を並べる）。ピンの位置は図面に対する % で書く
import { ActionIcon, Group, SegmentedControl, Text } from "@mantine/core";
import { IconMinus, IconPlus, IconZoomReset } from "@tabler/icons-react";
import { ICON_STROKE } from "./icons";
import type { Props } from "../lib/mock";

// 図面の論理サイズ。スマホの画面では幅を詰めて、部屋名が読める大きさに保つ
const SIZE = { wide: { W: 600, H: 360 }, narrow: { W: 360, H: 330 } };
const M = 20; // 外壁の位置
const DOOR = 24;

type Size = { W: number; H: number; top: number; bottom: number };

function sizeOf(narrow: boolean): Size {
  const { W, H } = narrow ? SIZE.narrow : SIZE.wide;
  const mid = H / 2;
  return { W, H, top: mid - 20, bottom: mid + 20 }; // 中廊下の上下の壁
}

// ピンの状態と凡例の名前
const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "今回の指摘", color: "var(--mantine-color-red-6)" },
  prev: { label: "前回の指摘", color: "var(--mantine-color-orange-6)" },
  done: { label: "是正済み", color: "var(--mantine-color-teal-6)" },
};

type Room = { name: string; x: number; y: number; w: number; h: number; top: boolean };

function layoutRooms(names: string[], { W, H, top: cTop, bottom: cBottom }: Size): Room[] {
  const top = names.slice(0, Math.ceil(names.length / 2));
  const bottom = names.slice(top.length);
  const row = (list: string[], isTop: boolean) => {
    const w = (W - 2 * M) / Math.max(1, list.length);
    return list.map((name, i) => ({
      name,
      x: M + i * w,
      y: isTop ? M : cBottom,
      w,
      h: isTop ? cTop - M : H - M - cBottom,
      top: isTop,
    }));
  };
  return [...row(top, true), ...row(bottom, false)];
}

function Plan({ rooms, size }: { rooms: Room[]; size: Size }) {
  const { W, H } = size;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mock-plan" aria-hidden>
      <defs>
        <pattern id="mock-plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20,0 H0 V20" fill="none" className="mock-plan-grid" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#mock-plan-grid)" />
      <rect x={M} y={size.top} width={W - 2 * M} height={size.bottom - size.top} className="mock-plan-corridor" />
      {rooms.map((r) => {
        const stairs = /階段/.test(r.name);
        const doorX = r.x + 14;
        const wallY = r.top ? size.top : size.bottom;
        const swing = r.top ? -DOOR : DOOR;
        return (
          <g key={`${r.name}-${r.x}-${r.y}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} className="mock-plan-room" />
            {stairs &&
              Array.from({ length: Math.floor((r.w - 16) / 9) }, (_, i) => (
                <line key={i} x1={r.x + 8 + i * 9} x2={r.x + 8 + i * 9} y1={r.y + 18} y2={r.y + r.h - 18} className="mock-plan-thin" />
              ))}
            {/* 廊下側の扉: 壁を切り、開く向きを弧で描く */}
            <line x1={doorX} x2={doorX + DOOR} y1={wallY} y2={wallY} className="mock-plan-gap" />
            <path d={`M${doorX},${wallY} V${wallY + swing} A${DOOR},${DOOR} 0 0 ${r.top ? 1 : 0} ${doorX + DOOR},${wallY}`} className="mock-plan-thin" />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} className="mock-plan-label">
              {r.name}
            </text>
          </g>
        );
      })}
      <rect x={M} y={M} width={W - 2 * M} height={H - 2 * M} className="mock-plan-outer" />
      {/* 方位と縮尺 */}
      <g transform={`translate(${W - 44},${M + 26})`} className="mock-plan-mark">
        <path d="M0,-14 L6,6 L0,2 L-6,6 Z" />
        <text y={-18}>N</text>
      </g>
      <g transform={`translate(${M},${H - 6})`} className="mock-plan-mark">
        <path d="M0,-6 V0 H80 V-6 M40,-4 V0" fill="none" />
      </g>
    </svg>
  );
}

export default function MockDrawing({ p, narrow = false }: { p: Props; narrow?: boolean }) {
  const size = sizeOf(narrow);
  const rooms = layoutRooms((p.rooms as string[] | undefined) ?? ["室1", "室2", "室3", "室4", "室5", "室6"], size);
  const pins: Props[] = ((p.pins as Props[] | undefined) ?? []).map((pin, i) => ({ ...pin, label: String(pin.label ?? i + 1) }));
  const selected = p.selected != null ? String(p.selected) : undefined;
  const used = [...new Set(pins.map((pin) => pin.status ?? "new"))].filter((s) => STATUS[s]);
  const floors = (p.floors as string[] | undefined) ?? [];

  return (
    <div className="mock-drawing">
      {(p.title || floors.length > 0) && (
        <Group justify="space-between" gap="xs" mb={8} wrap="nowrap">
          {p.title && <Text size="sm" fw={700} truncate>{p.title}</Text>}
          {floors.length > 0 && <SegmentedControl size="xs" data={floors} value={String(p.floor ?? floors[0])} readOnly />}
        </Group>
      )}
      <div className="mock-drawing-sheet">
        <Plan rooms={rooms} size={size} />
        {pins.map((pin) => {
          const st = STATUS[pin.status ?? "new"] ?? STATUS.new;
          const on = pin.label === selected;
          return (
            <div
              key={pin.label}
              className="mock-pin"
              data-selected={on || undefined}
              style={{ left: `${pin.x ?? 50}%`, top: `${pin.y ?? 50}%`, "--pin": st.color } as React.CSSProperties}
            >
              <span className="mock-pin-head">
                <span>{pin.label}</span>
              </span>
              {on && pin.text && (
                <span className="mock-pin-callout" data-align={(pin.x ?? 50) < 30 ? "start" : (pin.x ?? 50) > 70 ? "end" : "center"}>
                  <b>{pin.label}</b>
                  {pin.text}
                </span>
              )}
            </div>
          );
        })}
        <div className="mock-drawing-zoom">
          <ActionIcon variant="default" size="md" aria-label="拡大"><IconPlus size={16} stroke={ICON_STROKE} /></ActionIcon>
          <ActionIcon variant="default" size="md" aria-label="縮小"><IconMinus size={16} stroke={ICON_STROKE} /></ActionIcon>
          <ActionIcon variant="default" size="md" aria-label="全体"><IconZoomReset size={16} stroke={ICON_STROKE} /></ActionIcon>
        </div>
      </div>
      {used.length > 1 && (
        <Group gap="md" mt={8}>
          {used.map((s) => (
            <Text key={s} size="xs" c="dimmed" className="mock-pin-legend" style={{ "--pin": STATUS[s].color } as React.CSSProperties}>
              {STATUS[s].label}
            </Text>
          ))}
        </Group>
      )}
    </div>
  );
}
