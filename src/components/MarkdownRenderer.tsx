import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "../lib/utils";

/**
 * Full markdown renderer for chat messages.
 *
 * This module is intentionally lazy-loaded (see ChatRoom.tsx) so the
 * react-markdown / micromark / remark stack (~250 kB minified) stays out of
 * the initial bundle and is only fetched when a chat view actually renders.
 */
const MarkdownRenderer = React.memo(
  ({ content, isMe }: { content: string; isMe?: boolean }) => {
    return (
      <div className="markdown-body text-inherit leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            p: ({ node, children, ...props }) => {
              const renderChildren = React.Children.map(children, (child) => {
                if (typeof child === "string") {
                  return child.split(/(@\w+)/g).map((part, i) =>
                    part.startsWith("@") ? (
                      <span
                        key={i}
                        className={cn(
                          "font-bold px-1 rounded mx-0.5 whitespace-nowrap",
                          isMe
                            ? "bg-white/20 text-white"
                            : "text-blue-500 bg-blue-500/10",
                        )}
                      >
                        {part}
                      </span>
                    ) : (
                      part
                    ),
                  );
                }
                return child;
              });
              return (
                <p className="m-0 mb-2 last:mb-0 break-words" {...props}>
                  {renderChildren}
                </p>
              );
            },
            a: ({ node, ...props }) => (
              <a
                className={cn(
                  "hover:underline font-medium break-all",
                  isMe ? "text-white underline" : "text-blue-600",
                )}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              />
            ),
            code: ({ node, className, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || "");
              return match ? (
                <code className={className} {...props} />
              ) : (
                <code
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[0.9em] font-mono break-words",
                    isMe
                      ? "bg-black/20"
                      : "bg-slate-100 text-slate-800 border border-slate-200/50",
                  )}
                  {...props}
                />
              );
            },
            pre: ({ node, ...props }) => (
              <pre
                className="bg-slate-800 text-slate-50 p-3 rounded-xl overflow-x-auto text-[0.85em] my-2 font-mono shadow-inner !whitespace-pre"
                {...props}
              />
            ),
            ul: ({ node, ...props }) => (
              <ul className="list-disc list-outside ml-4 mb-2" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="list-decimal list-outside ml-4 mb-2" {...props} />
            ),
            li: ({ node, ...props }) => <li className="mb-1" {...props} />,
            blockquote: ({ node, ...props }) => (
              <blockquote
                className={cn(
                  "border-l-4 pl-3 py-0.5 italic opacity-90 my-2",
                  isMe
                    ? "border-white/50 bg-white/10"
                    : "border-slate-300 bg-slate-50 text-slate-600",
                )}
                {...props}
              />
            ),
            h1: ({ node, ...props }) => (
              <h1 className="text-xl font-bold mb-2 mt-4" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-lg font-bold mb-2 mt-3" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-base font-bold mb-2 mt-2" {...props} />
            ),
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-2 rounded-lg border border-slate-100">
                <table
                  className="min-w-full divide-y divide-slate-200/50"
                  {...props}
                />
              </div>
            ),
            th: ({ node, ...props }) => (
              <th
                className={cn(
                  "px-3 py-2 text-left text-xs font-bold uppercase tracking-wider",
                  isMe ? "bg-black/10" : "bg-slate-50/50 text-slate-500",
                )}
                {...props}
              />
            ),
            td: ({ node, ...props }) => (
              <td
                className="px-3 py-2 text-sm border-t border-slate-200/20"
                {...props}
              />
            ),
            hr: ({ node, ...props }) => (
              <hr
                className={cn(
                  "my-3 border-t",
                  isMe ? "border-white/20" : "border-slate-200",
                )}
                {...props}
              />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  },
);

MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
