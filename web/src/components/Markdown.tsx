import { isValidElement, lazy, Suspense } from "react";
import { Loader } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Gantt from "./Gantt";
import Mermaid from "./Mermaid";
import ScreenMock from "./ScreenMock";

const ErDiagram = lazy(() => import("./ErDiagram"));
const UsecaseDiagram = lazy(() => import("./UsecaseDiagram"));
const FlowDiagram = lazy(() => import("./FlowDiagram"));
const ArchDiagram = lazy(() => import("./ArchDiagram"));

// ```言語名 のコードブロックを図として描画する
const DIAGRAMS: Record<string, (source: string, screen?: string) => React.ReactElement> = {
  "language-mermaid": (s) => <Mermaid code={s.trim()} />,
  "language-gantt": (s) => <Gantt source={s} />,
  "language-mock": (s, screen) => <ScreenMock source={s} screen={screen} />,
  "language-er": (s) => (
    <Suspense fallback={<Loader size="sm" />}>
      <ErDiagram source={s} />
    </Suspense>
  ),
  "language-usecase": (s) => (
    <Suspense fallback={<Loader size="sm" />}>
      <UsecaseDiagram source={s} />
    </Suspense>
  ),
  "language-flow": (s) => (
    <Suspense fallback={<Loader size="sm" />}>
      <FlowDiagram source={s} />
    </Suspense>
  ),
  "language-arch": (s) => (
    <Suspense fallback={<Loader size="sm" />}>
      <ArchDiagram source={s} />
    </Suspense>
  ),
};

type MdNode = {
  type: string;
  value?: string;
  depth?: number;
  lang?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, string> };
};

const textOf = (n: MdNode): string => n.value ?? (n.children ?? []).map(textOf).join("");

// ```mock に直前の見出しの画面ID（## SC-01 … の SC-01）を data-screen として持たせる（画面イメージの帯に出す）
export function remarkScreenIds() {
  return (tree: MdNode) => {
    let current: string | undefined;
    for (const node of tree.children ?? []) {
      if (node.type === "heading") {
        // ## の見出しで画面が変わる。### 以下は画面IDを書いたときだけ切り替える
        const id = /^([A-Za-z]+-\d+)/.exec(textOf(node).trim())?.[1];
        if (id || node.depth === 2) current = id;
      }
      if (node.type === "code" && node.lang === "mock" && current)
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, "data-screen": current } };
    }
  };
}

// 原稿の HTML コメント（雛形の書き方メモなど）は表示しない。生の HTML は描画しないので、そのままだと文字として出てしまう
export function remarkStripComments() {
  const strip = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.filter((c) => !(c.type === "html" && /^\s*<!--[\s\S]*-->\s*$/.test(c.value ?? "")));
    node.children.forEach(strip);
  };
  return strip;
}

// 表の短いセル（ID・日付・状態など）は途中で折り返さない。長い列に幅を取られて「Q-」「01」のように割れるのを防ぐ
const SHORT_CELL = 8;
function cellClass(children: React.ReactNode): string | undefined {
  const parts = Array.isArray(children) ? children : [children];
  if (!parts.every((c) => typeof c === "string" || typeof c === "number")) return undefined;
  return parts.join("").trim().length <= SHORT_CELL ? "ks-cell-short" : undefined;
}

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkStripComments, remarkScreenIds]}
      components={{
        // 図は <pre> の中に入れない（等幅・改行保持のスタイルが効いてしまうため）
        pre({ children, ...props }) {
          if (isValidElement<{ className?: string; children?: React.ReactNode; "data-screen"?: string }>(children)) {
            const render = DIAGRAMS[children.props.className ?? ""];
            if (render) return render(String(children.props.children), children.props["data-screen"]);
          }
          return <pre {...props}>{children}</pre>;
        },
        td: ({ node: _, children, ...props }) => <td {...props} className={cellClass(children)}>{children}</td>,
        th: ({ node: _, children, ...props }) => <th {...props} className={cellClass(children)}>{children}</th>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
