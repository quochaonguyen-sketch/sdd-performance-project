"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { X, Sparkles, ArrowRight, MessageSquareQuote } from "lucide-react";
import { useAiChatOpen, toggleAiChatOpen, openAiChatWithPrompt } from "@/lib/ai/ai-chat-store";
import { cn } from "@/utils/cn";

const Nova3DBot = dynamic(() => import("./nova-3d-bot").then((mod) => mod.Nova3DBot), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center">
      <Sparkles size={24} className="animate-pulse text-cyan-400" />
    </div>
  ),
});

const NOVA_TIPS = [
  {
    tag: "Giao ca & Tổng quan",
    question: "Hôm nay cần tôi xem Tổng quan hôm nay có gì không? 👋",
    prompt: "Tổng quan hôm nay có gì?",
  },
  {
    tag: "Tra cứu Rider",
    question: "Hỏi tôi: Nguyễn Văn A nay giao bao nhiêu đơn, onhold bao nhiêu đơn? 🛵",
    prompt: "Nguyễn Văn A nay giao bao nhiêu đơn, onhold bao nhiêu đơn?",
  },
  {
    tag: "Đơn Kho 4232",
    question: "Hỏi tôi: Iphone hôm nay có vấn đề gì không? 📱",
    prompt: "Iphone hôm nay có vấn đề gì không?",
  },
  {
    tag: "Tiến độ toàn đội",
    question: "Hỏi tôi: Delivery Realtime & Pickup Realtime hôm nay? ⚡",
    prompt: "Tiến độ Delivery Realtime và Pickup Realtime hôm nay thế nào?",
  },
  {
    tag: "Phân tích vận hành",
    question: "Hỏi tôi: Khu vực nào đang có tỷ lệ OH cao nhất? 📊",
    prompt: "Khu vực nào có tỷ lệ OH cao nhất?",
  },
] as const;

export function FloatingAiBot() {
  const isOpen = useAiChatOpen();
  const [hovered, setHovered] = useState(false);
  const [bubbleIndex, setBubbleIndex] = useState(0);
  const [bubbleDismissed, setBubbleDismissed] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);

  // Pop up speech bubble smoothly after 1s on page load
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBubbleVisible(true);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, []);

  // Cycle through suggested questions every 7 seconds when not paused by hover or open
  useEffect(() => {
    if (isOpen || bubbleDismissed || hovered) return;
    const interval = window.setInterval(() => {
      setBubbleIndex((prev) => (prev + 1) % NOVA_TIPS.length);
    }, 7000);
    return () => window.clearInterval(interval);
  }, [isOpen, bubbleDismissed, hovered]);

  const currentTip = NOVA_TIPS[bubbleIndex];

  function handleBubbleClick(e: React.MouseEvent) {
    e.stopPropagation();
    openAiChatWithPrompt(currentTip.prompt);
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setHovered(false);
    setBubbleDismissed(true);
  }

  const showBubble = !isOpen && bubbleVisible && !bubbleDismissed;

  return (
    <aside
      className="fixed bottom-40 right-4 z-[85] pointer-events-auto sm:bottom-[5.5rem] sm:right-6"
      aria-label="Nova AI - Trợ lý ảo 3D SDD"
    >
      {/* Interactive Cartoon Speech Bubble outside on the website */}
      <div
        className={cn(
          "absolute right-full top-1/2 mr-3 sm:mr-4 -translate-y-1/2 w-64 sm:w-72 max-w-[calc(100vw-6rem)]",
          "rounded-2xl border border-cyan-400/50 bg-white/95 dark:bg-slate-900/95 dark:border-cyan-600/50 p-3.5",
          "shadow-[0_12px_36px_rgba(6,182,212,0.22)] backdrop-blur-md",
          "transition-all duration-150 ease-out transform",
          showBubble
            ? "translate-x-0 opacity-100 scale-100 pointer-events-auto cursor-pointer"
            : "translate-x-2 opacity-0 scale-95 pointer-events-none"
        )}
        onClick={handleBubbleClick}
        title="Bấm để hỏi Nova ngay"
        role="button"
        tabIndex={showBubble ? 0 : -1}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top bar with Bot tag & dismiss button */}
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
            </span>
            <span className="text-[11px] font-bold tracking-wide text-cyan-600 dark:text-cyan-400">
              Nova 3D
            </span>
            <span className="rounded bg-cyan-100/70 dark:bg-cyan-950/80 px-1.5 py-0.5 text-[9px] font-medium text-cyan-800 dark:text-cyan-300">
              {currentTip.tag}
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Thu gọn gợi ý"
            title="Đóng gợi ý"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Question body with dialogue style */}
        <div className="mt-2 text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
          <p key={bubbleIndex} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            {currentTip.question}
          </p>
        </div>

        {/* Action prompt link */}
        <div className="mt-2.5 flex items-center justify-between pt-1 text-[10px] text-cyan-600 dark:text-cyan-400 font-medium">
          <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
            <MessageSquareQuote size={11} />
            <span>Gợi ý câu hỏi</span>
          </span>
          <span className="inline-flex items-center gap-0.5 hover:underline font-semibold">
            <span>Hỏi ngay</span>
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        {/* Triangle arrow pointer pointing to Nova 3D bot on the right */}
        <span className="absolute -right-2 top-1/2 -translate-y-1/2 border-[7px] border-transparent border-l-cyan-400/60 dark:border-l-cyan-600/60" />
        <span className="absolute -right-[6px] top-1/2 -translate-y-1/2 border-[6px] border-transparent border-l-white dark:border-l-slate-900" />
      </div>

      {/* Floating 3D Bot Button - 100% Transparent Background */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="ollama-chat-panel"
        aria-label={isOpen ? "Đóng Nova AI" : "Mở Nova AI - Trợ lý 3D SDD"}
        title={isOpen ? "Đóng Nova AI" : "Nova AI (3D Bot)"}
        onClick={() => toggleAiChatOpen()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "group relative flex items-center justify-center outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950",
          isOpen
            ? "size-12 rounded-full bg-slate-900/95 text-white border border-slate-700/80 shadow-[0_12px_32px_rgba(15,23,42,0.35)] backdrop-blur-md hover:bg-slate-800"
            : "size-20 bg-transparent border-0 p-0 shadow-none hover:scale-110 active:scale-95 cursor-pointer filter drop-shadow-[0_10px_18px_rgba(6,182,212,0.35)] hover:drop-shadow-[0_14px_26px_rgba(6,182,212,0.6)]"
        )}
      >
        {isOpen ? (
          <div className="grid size-full place-items-center">
            <X size={22} className="transition-transform duration-200 group-hover:rotate-90" aria-hidden="true" />
          </div>
        ) : (
          <div className="relative size-full overflow-visible flex items-center justify-center pointer-events-none">
            {/* 100% Transparent WebGL 3D Nova Robot waving hello */}
            <Nova3DBot size={76} isWaving interactive={false} />
          </div>
        )}

        {/* Online Status Beacon */}
        {!isOpen && (
          <span
            className="absolute top-1 right-2 flex size-3.5 items-center justify-center pointer-events-none"
            title="Nova 3D sẵn sàng"
          >
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-cyan-400 ring-2 ring-white dark:ring-slate-950 shadow-sm" />
          </span>
        )}
      </button>
    </aside>
  );
}
