import { useLayoutEffect, useRef, useState } from "react";

// 論理幅で組んだ中身（画面イメージや図）を、置き場所の幅に合わせて縮小する
export default function Scaled({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ scale: number; height?: number }>({ scale: 1 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const scale = Math.min(1, o.clientWidth / width);
      setSize({ scale, height: i.offsetHeight * scale });
    };
    const ro = new ResizeObserver(update);
    ro.observe(o);
    ro.observe(i);
    update();
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outer} className="ks-scaled" style={{ height: size.height }}>
      <div ref={inner} style={{ width, transform: `scale(${size.scale})` }}>
        {children}
      </div>
    </div>
  );
}
