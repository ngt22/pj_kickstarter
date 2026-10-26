import { useLayoutEffect, useRef, useState } from "react";
import { usePrint } from "../lib/print";

// PDF では 1 ページに収まるよう、高さもこの値（A4 縦の本文の 2/3 ほど。見出しや注釈と同じページに入る高さ）までに縮める
const PRINT_MAX_HEIGHT = 640;

// 論理幅で組んだ中身（画面イメージや図）を、置き場所の幅に合わせて縮小する
export default function Scaled({ width, printMaxHeight = PRINT_MAX_HEIGHT, children }: { width: number; printMaxHeight?: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const print = usePrint();
  const [size, setSize] = useState<{ scale: number; height?: number; left?: number }>({ scale: 1 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const scale = Math.min(1, o.clientWidth / width, print ? printMaxHeight / i.offsetHeight : 1);
      // 高さで縮めて幅が余ったときは中央に置く
      setSize({ scale, height: i.offsetHeight * scale, left: Math.max(0, (o.clientWidth - width * scale) / 2) });
    };
    const ro = new ResizeObserver(update);
    ro.observe(o);
    ro.observe(i);
    update();
    return () => ro.disconnect();
  }, [width, print, printMaxHeight]);

  // PDF では transform ではなく zoom で縮める。transform では元の幅が紙からはみ出したままになり、
  // ブラウザがページ全体を縮めて刷ってしまうため（zoom は縮めた大きさで組まれる。offsetHeight は縮める前の値のまま）
  if (print)
    return (
      <div ref={outer} className="ks-scaled">
        <div ref={inner} style={{ width, zoom: size.scale, marginLeft: size.left && size.left / size.scale }}>
          {children}
        </div>
      </div>
    );
  return (
    <div ref={outer} className="ks-scaled" style={{ height: size.height }}>
      <div ref={inner} style={{ width, transform: `scale(${size.scale})` }}>
        {children}
      </div>
    </div>
  );
}
