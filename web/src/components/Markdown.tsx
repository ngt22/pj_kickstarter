import { isValidElement, lazy, Suspense } from "react";
import { Loader } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Gantt from "./Gantt";
import Mermaid from "./Mermaid";
import ScreenMock from "./ScreenMock";

const ErDiagram = lazy(() => import("./ErDiagram"));

// ```言語名 のコードブロックを図として描画する
const DIAGRAMS: Record<string, (source: string) => React.ReactElement> = {
  "language-mermaid": (s) => <Mermaid code={s.trim()} />,
  "language-gantt": (s) => <Gantt source={s} />,
  "language-mock": (s) => <ScreenMock source={s} />,
  "language-er": (s) => (
    <Suspense fallback={<Loader size="sm" />}>
      <ErDiagram source={s} />
    </Suspense>
  ),
};

type MdNode = { type: string; value?: string; children?: MdNode[] };

// 原稿の HTML コメント（雛形の書き方メモなど）は表示しない。生の HTML は描画しないので、そのままだと文字として出てしまう
export function remarkStripComments() {
  const strip = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.filter((c) => !(c.type === "html" && /^\s*<!--[\s\S]*-->\s*$/.test(c.value ?? "")));
    node.children.forEach(strip);
  };
  return strip;
}

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkStripComments]}
      components={{
        // 図は <pre> の中に入れない（等幅・改行保持のスタイルが効いてしまうため）
        pre({ children, ...props }) {
          if (isValidElement<{ className?: string; children?: React.ReactNode }>(children)) {
            const render = DIAGRAMS[children.props.className ?? ""];
            if (render) return render(String(children.props.children));
          }
          return <pre {...props}>{children}</pre>;
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
