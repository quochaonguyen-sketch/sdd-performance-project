"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Sparkles } from "lucide-react";

const Chat = dynamic(() => import("./ollama-chatbox").then(module => module.OllamaChatbox), {
  loading: () => <LaunchButton busy />,
});
export function AiLauncher() {
  const [opened, setOpened] = useState(false);
  return opened ? <Chat initialOpen /> : <LaunchButton onOpen={() => setOpened(true)} />;
}
function LaunchButton({ busy = false, onOpen }: { busy?: boolean; onOpen?: () => void }) {
  return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls="ollama-chat-panel"
        title="Rider Ops AI"
        onClick={onOpen}
        disabled={busy}
        aria-busy={busy}
        className="group relative inline-grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-400/50 bg-emerald-600 text-sm font-semibold text-white outline-none transition-[background-color,transform] duration-150 hover:bg-emerald-700 active:translate-y-px focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 xl:inline-flex xl:w-auto xl:gap-2 xl:px-3 dark:border-emerald-400/50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-slate-950"
      >
        <Sparkles size={22} aria-hidden="true" />
        <span className="hidden whitespace-nowrap xl:inline">{busy ? "Đang mở AI…" : "Bật AI"}</span>
        <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-300 ring-2 ring-white dark:ring-slate-950" aria-hidden="true" />
        <span className="sr-only">Mở Rider Ops AI</span>
      </button>
  );
}
