import { Code, useComputedColorScheme, useMantineTheme, type MantineTheme } from "@mantine/core";
import { useEffect, useId, useState } from "react";

// 図の配色をデザイントークンに合わせる
function themeVariables(t: MantineTheme, dark: boolean) {
  const c = t.colors;
  return dark
    ? {
        darkMode: true,
        background: c.dark[7],
        primaryColor: c.brand[9],
        primaryBorderColor: c.brand[5],
        primaryTextColor: c.dark[0],
        secondaryColor: c.teal[9],
        tertiaryColor: c.dark[6],
        lineColor: c.dark[2],
        textColor: c.dark[0],
        clusterBkg: c.dark[6],
        clusterBorder: c.dark[4],
        fontFamily: t.fontFamily,
      }
    : {
        background: t.white,
        primaryColor: c.brand[0],
        primaryBorderColor: c.brand[4],
        primaryTextColor: t.black,
        secondaryColor: c.teal[0],
        tertiaryColor: c.gray[0],
        lineColor: c.gray[5],
        textColor: t.black,
        clusterBkg: c.gray[0],
        clusterBorder: c.gray[3],
        fontFamily: t.fontFamily,
      };
}

// mermaid は大きいので、図があるページを開いたときだけ読み込む
export default function Mermaid({ code }: { code: string }) {
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const theme = useMantineTheme();
  const dark = useComputedColorScheme("light") === "dark";

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: themeVariables(theme, dark),
      });
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
  }, [id, code, theme, dark]);

  if (error) return <Code block c="red">{error}</Code>;
  return <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
