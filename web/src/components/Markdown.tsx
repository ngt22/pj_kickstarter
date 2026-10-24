import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Mermaid from "./Mermaid";

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          if (className === "language-mermaid") return <Mermaid code={String(children).trim()} />;
          return <code className={className} {...props}>{children}</code>;
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
