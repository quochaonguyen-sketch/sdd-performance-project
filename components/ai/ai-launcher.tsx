"use client";
import dynamic from "next/dynamic";
import { X, Sparkles } from "lucide-react";
import { useAiChatOpen, toggleAiChatOpen } from "@/lib/ai/ai-chat-store";

const Chat = dynamic(() => import("./ollama-chatbox").then(module => module.OllamaChatbox), {
  loading: () => <LaunchButton busy />,
});

const Nova3DBot = dynamic(() => import("./nova-3d-bot").then(mod => mod.Nova3DBot), {
  ssr: false,
  loading: () => <Sparkles size={16} className="text-cyan-300 animate-pulse" />,
});

export function AiLauncher() {
  const isOpen = useAiChatOpen();
  return (
    <>
      <LaunchButton isOpen={isOpen} onToggle={() => toggleAiChatOpen()} />
      <Chat initialOpen={isOpen} />
    </>
  );
}

function LaunchButton({ busy = false, isOpen = false, onToggle }: { busy?: boolean; isOpen?: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls="ollama-chat-panel"
      aria-label={isOpen ? "Đóng Nova AI" : "Mở Nova AI"}
      title="Nova AI"
      onClick={onToggle}
      disabled={busy}
      aria-busy={busy}
      className="group relative inline-grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/40 bg-gradient-to-r from-blue-600 to-cyan-600 text-sm font-semibold text-white shadow-sm outline-none transition-colors hover:from-blue-700 hover:to-cyan-700 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 xl:inline-flex xl:w-auto xl:gap-2 xl:px-3 dark:focus-visible:ring-offset-slate-950"
    >
      {isOpen ? (
        <X size={19} aria-hidden="true" />
      ) : (
        <span className="relative flex size-6 items-center justify-center overflow-visible">
          <Nova3DBot size={24} isWaving={false} interactive={false} />
        </span>
      )}
      <span className="hidden whitespace-nowrap xl:inline">{busy ? "Đang mở AI…" : isOpen ? "Đóng AI" : "Bật AI"}</span>
      <span className="sr-only">Mở Nova AI</span>
    </button>
  );
}
