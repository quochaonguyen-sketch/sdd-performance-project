"use client";

import { useMemo, useState } from "react";
import { marked } from "marked";
import { Copy, Check } from "lucide-react";

interface NovaMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

// Configure marked for clean GFM and line breaks
marked.setOptions({
  gfm: true,
  breaks: true,
});

export function NovaMarkdown({ content, isStreaming = false }: NovaMarkdownProps) {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    if (!content) return "";
    try {
      return marked.parse(content) as string;
    } catch {
      return content;
    }
  }, [content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="group/nova-msg relative w-full">
      {/* Markdown Content with Professional AI Typography */}
      <div
        className="nova-ai-prose text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-150"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Copy button that appears on hover when not streaming */}
      {!isStreaming && content && (
        <div className="mt-2 flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? "Đã sao chép!" : "Sao chép nội dung"}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Đã sao chép</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Sao chép</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
