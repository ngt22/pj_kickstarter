import { Popover, useMantineTheme } from "@mantine/core";
import { IconNote } from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  anchorAt,
  bounds,
  createSmoother,
  flatten,
  PEN_WIDTH,
  placement,
  simplify,
  smoothPath,
  unflatten,
  type Anchor,
  type Annotation,
  type InkColor,
  type InkItem,
  type Point,
  type Smoother,
} from "../../lib/annotations";
import AnnotationCard from "./AnnotationCard";
import { useAnnotations } from "./AnnotationContext";
import AnnotationToolbar, { type Tool } from "./AnnotationToolbar";
import SaveAnnotationModal from "./SaveAnnotationModal";

// これより短いドラッグは囲み・引出線にしない（クリックとみなす）
const MIN_DRAG = 8;

export type Draft = { items: InkItem[]; anchor: Anchor | null };

function useInk() {
  const theme = useMantineTheme();
  const colors = theme.other.inkColors as Record<InkColor, string>;
  return (c: InkColor) => colors[c];
}

// 引出線の矢じり（指している側）を、線の向きに合わせた三角形で描く
function arrowHead(tip: Point, from: Point, size: number) {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  const p = (d: number) => `${tip.x - size * Math.cos(a + d)},${tip.y - size * Math.sin(a + d)}`;
  return `${tip.x},${tip.y} ${p(0.45)} ${p(-0.45)}`;
}

// 線と囲みの絵（SVG）。保存済みの付箋と書きかけの下書きの両方で使う
function InkShapes({ items }: { items: InkItem[] }) {
  const ink = useInk();
  return (
    <>
      {items.map((it, i) => {
        if (it.kind === "pen")
          return <path key={i} d={smoothPath(unflatten(it.points))} stroke={ink(it.color)} strokeWidth={it.width} className="ks-ink-pen" />;
        if (it.kind === "box")
          return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={6} stroke={ink(it.color)} className="ks-ink-box" />;
        const [tip, end] = unflatten(it.points);
        return (
          <g key={i} stroke={ink(it.color)} fill={ink(it.color)}>
            <line x1={end.x} y1={end.y} x2={tip.x} y2={tip.y} className="ks-ink-line" />
            <polygon points={arrowHead(tip, end, 11)} strokeWidth={1} />
            <circle cx={end.x} cy={end.y} r={3} />
          </g>
        );
      })}
    </>
  );
}

// 囲みの中の文字（HTML で重ねる。SVG だと折り返せないため）
function BoxTexts({ items }: { items: InkItem[] }) {
  const ink = useInk();
  return (
    <>
      {items.map((it, i) =>
        it.kind === "box" && it.text.trim() ? (
          <div key={i} className="ks-ink-boxtext" style={{ left: it.x, top: it.y, width: it.w, maxHeight: it.h, ["--ink" as string]: ink(it.color) }}>
            <span>{it.text}</span>
          </div>
        ) : null,
      )}
    </>
  );
}

type Placed = { a: Annotation; x: number; y: number; scale: number };

// 資料の上に重ねる付箋レイヤー。付箋モードの間だけ付箋を表示し、道具を選ぶと書き込める
export default function AnnotationLayer({ children }: { children: ReactNode }) {
  const { annotations, docType, active, focusId, clearFocus, listOpen } = useAnnotations();
  const ink = useInk();
  const rootRef = useRef<HTMLDivElement>(null);
  // 指で触る画面では、ペンのままだとスクロールできないので「閲覧」から始める
  const [tool, setTool] = useState<Tool>(() => (window.matchMedia?.("(pointer: coarse)").matches ? "view" : "pen"));
  const [color, setColor] = useState<InkColor>("red");
  const [smoothness, setSmoothness] = useState(0.5);
  const [draft, setDraft] = useState<Draft>({ items: [], anchor: null });
  const [live, setLive] = useState<InkItem | null>(null);
  const [editing, setEditing] = useState<number | null>(null); // 文字を入力中の囲み（draft.items の番号）
  const [saving, setSaving] = useState(false);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [openPin, setOpenPin] = useState<string | null>(null);
  const gesture = useRef<{ start: Point; smoother?: Smoother; client: Point } | null>(null);

  // ページが変わったら下書きは捨てる（座標がそのページのものなので）
  useEffect(() => {
    setDraft({ items: [], anchor: null });
    setEditing(null);
    setOpenPin(null);
  }, [docType]);

  // 図の読み込みや画面幅の変化で資料の形が変わったら、付箋の位置を計算し直す
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bump = () => setLayoutTick((t) => t + 1);
    const ro = new ResizeObserver(bump);
    ro.observe(root);
    window.addEventListener("resize", bump);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return setPlaced([]);
    setPlaced(annotations.filter((a) => a.docType === docType).map((a) => ({ a, ...placement(root, a) })));
  }, [annotations, docType, active, layoutTick]);

  // 一覧から選ばれた付箋へスクロールし、少しの間目立たせる
  useEffect(() => {
    if (!focusId) return;
    const p = placed.find((x) => x.a.id === focusId);
    const root = rootRef.current;
    if (!p || !root) return;
    const b = bounds(p.a.items);
    const top = root.getBoundingClientRect().top + window.scrollY + p.y + (b?.y ?? 0) * p.scale;
    // 図が読み込まれて位置がずれるのを少し待つ
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: Math.max(0, top - 140), behavior: "smooth" });
      setFlash(focusId);
      clearFocus();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [focusId, placed, clearFocus]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [flash]);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const undo = useCallback(() => {
    setEditing(null);
    setDraft((d) => {
      const items = d.items.slice(0, -1);
      return { items, anchor: items.length ? d.anchor : null };
    });
  }, []);

  // Ctrl+Z / ⌘Z でも 1 ストローク戻す（文字の入力中は入力欄の取り消しに任せる）
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
      if (e.key === "Escape") setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, undo]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditing(null);
    const start = local(e);
    gesture.current = { start, client: { x: e.clientX, y: e.clientY }, smoother: tool === "pen" ? createSmoother(start, smoothness) : undefined };
    if (tool === "pen") setLive({ kind: "pen", color, width: PEN_WIDTH, points: flatten([start]) });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.smoother) {
      // ペンは間引かれる前の細かい点（coalesced events）も使って、速く動かしても角ばらないようにする
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      let changed = false;
      for (const ev of events.length ? events : [e.nativeEvent]) changed = g.smoother.push(local(ev)) || changed;
      if (changed) setLive({ kind: "pen", color, width: PEN_WIDTH, points: flatten(g.smoother.points) });
      return;
    }
    const p = local(e);
    if (tool === "box")
      setLive({ kind: "box", color, x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y), text: "" });
    else if (tool === "line") setLive({ kind: "line", color, points: flatten([g.start, p]) });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setLive(null);
    if (!g) return;
    const p = local(e);
    let item: InkItem | null = null;
    if (g.smoother) {
      g.smoother.finish(p);
      item = { kind: "pen", color, width: PEN_WIDTH, points: flatten(simplify(g.smoother.points)) };
    } else if (Math.hypot(p.x - g.start.x, p.y - g.start.y) >= MIN_DRAG) {
      if (tool === "box")
        item = { kind: "box", color, x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y), text: "" };
      else item = { kind: "line", color, points: flatten([g.start, p]) };
    } else if (tool === "box") {
      // 囲みの中をクリックしたら、その囲みの文字を書き直す
      for (let i = draft.items.length - 1; i >= 0; i--) {
        const it = draft.items[i];
        if (it.kind === "box" && p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h) return setEditing(i);
      }
      return;
    }
    if (!item) return;
    // 最初の 1 本を書いた位置の要素を、この付箋の目印にする
    const anchor = draft.anchor ?? anchorAt(rootRef.current!, g.client.x, g.client.y);
    const index = draft.items.length;
    setDraft({ items: [...draft.items, item], anchor });
    if (item.kind === "box") setEditing(index);
  };

  const setBoxText = (i: number, text: string) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i && it.kind === "box" ? { ...it, text } : it)) }));

  const drawing = active && tool !== "view";
  const editingBox = editing !== null ? draft.items[editing] : undefined;

  return (
    <div ref={rootRef} className="ks-annot-root">
      {children}
      {active && (
        <div className="ks-annot-overlay" data-annot-ui>
          {placed.map(({ a, x, y, scale }) => {
            const b = bounds(a.items);
            return (
              <div key={a.id} className="ks-annot-item" data-status={a.status} data-flash={flash === a.id || undefined}>
                <div className="ks-annot-scaled" style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
                  <svg className="ks-annot-svg">
                    {b && <rect x={b.x - 8} y={b.y - 8} width={b.w + 16} height={b.h + 16} rx={10} className="ks-annot-halo" />}
                    <InkShapes items={a.items} />
                  </svg>
                  <BoxTexts items={a.items} />
                </div>
                {b && (
                  <Popover opened={openPin === a.id} onChange={(o) => setOpenPin(o ? a.id : null)} width={320} position="bottom-start" shadow="md" withinPortal>
                    <Popover.Target>
                      <button
                        type="button"
                        className="ks-annot-pin"
                        style={{ left: x + (b.x - 8) * scale, top: y + (b.y - 8) * scale }}
                        onClick={() => setOpenPin(openPin === a.id ? null : a.id)}
                        aria-label="付箋の内容を見る"
                      >
                        <IconNote size={14} />
                      </button>
                    </Popover.Target>
                    <Popover.Dropdown p={0} className="ks-annot-popover">
                      <AnnotationCard a={a} />
                    </Popover.Dropdown>
                  </Popover>
                )}
              </div>
            );
          })}
          {/* 下書き（まだ保存していない書き込み） */}
          <div className="ks-annot-item" data-draft>
            <svg className="ks-annot-svg">
              <InkShapes items={live ? [...draft.items, live] : draft.items} />
            </svg>
            <BoxTexts items={draft.items.filter((_, i) => i !== editing)} />
          </div>
          {drawing && (
            <div
              className="ks-annot-surface"
              data-tool={tool}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                gesture.current = null;
                setLive(null);
              }}
            />
          )}
          {editingBox?.kind === "box" && (
            <textarea
              className="ks-ink-boxinput"
              style={{ left: editingBox.x, top: editingBox.y, width: editingBox.w, height: editingBox.h, ["--ink" as string]: ink(editingBox.color) }}
              value={editingBox.text}
              placeholder="指示を入力"
              autoFocus
              onChange={(e) => setBoxText(editing!, e.currentTarget.value)}
              onBlur={() => setEditing(null)}
            />
          )}
        </div>
      )}
      {active && (
        <AnnotationToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={setColor}
          smoothness={smoothness}
          onSmoothness={setSmoothness}
          canUndo={draft.items.length > 0}
          onUndo={undo}
          onSave={() => {
            setEditing(null);
            setSaving(true);
          }}
          onDiscard={() => {
            setEditing(null);
            setDraft({ items: [], anchor: null });
          }}
          shifted={listOpen}
        />
      )}
      <SaveAnnotationModal
        opened={saving}
        onClose={() => setSaving(false)}
        draft={draft}
        width={rootRef.current?.getBoundingClientRect().width ?? 0}
        onSaved={() => {
          setSaving(false);
          setDraft({ items: [], anchor: null });
        }}
      />
    </div>
  );
}
