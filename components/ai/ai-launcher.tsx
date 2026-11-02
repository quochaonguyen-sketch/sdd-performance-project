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
        aria-label="Mở Rider Ops AI"
        title="Rider Ops AI"
        onClick={onOpen}
        disabled={busy}
        aria-busy={busy}
        className="group relative inline-grid size-10 shrink-0 place-items-center rounded-xl border border-blue-400/50 bg-blue-600 text-sm font-semibold text-white outline-none transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 xl:inline-flex xl:w-auto xl:gap-2 xl:px-3 dark:focus-visible:ring-offset-slate-950"
      >
        <Sparkles size={19} aria-hidden="true" />
        <span className="hidden whitespace-nowrap xl:inline">{busy ? "Đang mở AI…" : "Bật AI"}</span>
        <span className="sr-only">Mở Rider Ops AI</span>
      </button>
  );
}
