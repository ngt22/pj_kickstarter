import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Gantt from "./Gantt";
import Mermaid from "./Mermaid";
import ScreenMock from "./ScreenMock";

// ```言語名 のコードブロックを図として描画する
const DIAGRAMS: Record<string, (source: string) => React.ReactElement> = {
  "language-mermaid": (s) => <Mermaid code={s.trim()} />,
  "language-gantt": (s) => <Gantt source={s} />,
  "language-mock": (s) => <ScreenMock source={s} />,
};

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
