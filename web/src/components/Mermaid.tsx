import { Code } from "@mantine/core";
import { useEffect, useId, useState } from "react";

// mermaid は大きいので、図があるページを開いたときだけ読み込む
export default function Mermaid({ code }: { code: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      try {
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, code]);

  if (error) return <Code block c="red">{error}</Code>;
  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
