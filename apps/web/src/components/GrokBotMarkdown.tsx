import ReactMarkdown, { type Components } from "react-markdown";
import { CHAT_MARKDOWN_REMARK_PLUGINS_WITH_BREAKS } from "@t3tools/shared/markdownPipeline";

/** Grok paths belong to the bot's computer; never resolve them against the T3 workspace. */
export function grokBotMarkdownUrl(value: string, key: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    if (
      key === "href" &&
      (url.protocol === "mailto:" || (url.protocol === "grokbot:" && url.hostname === "app"))
    ) {
      return url.href;
    }
  } catch {
    // Relative files and Grok-specific internal references remain readable text.
  }
  return undefined;
}

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt }) =>
    src ? (
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        className="max-h-80 max-w-full rounded-lg object-contain"
      />
    ) : (
      <span className="text-xs text-muted-foreground">{alt || "Image in Grok Bot"}</span>
    ),
  table: ({ children }) => (
    <div className="chat-markdown-table-container overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};
// Quarantined: reuse the chat's GFM + line-break remark pipeline (remark-breaks now lives in shared).
const plugins = CHAT_MARKDOWN_REMARK_PLUGINS_WITH_BREAKS;

export function GrokBotMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown min-w-0 text-sm leading-relaxed text-inherit [overflow-wrap:anywhere] [word-break:break-word]">
      <ReactMarkdown
        components={components}
        remarkPlugins={plugins}
        urlTransform={grokBotMarkdownUrl}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
