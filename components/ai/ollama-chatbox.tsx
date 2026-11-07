"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/utils/cn";
import { NovaMarkdown } from "./nova-markdown";
import { useAiChatOpen, setAiChatOpen, consumeInitialDraft } from "@/lib/ai/ai-chat-store";
import { ArrowUpRight, Brain, Database, History, LoaderCircle, MoreHorizontal, RotateCcw, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { useBrowserAiConfig } from "@/lib/ai/browser-config";
import s from "./ai-workspace.module.css";

const Nova3DBot = dynamic(() => import("./nova-3d-bot").then((mod) => mod.Nova3DBot), {
  ssr: false,
  loading: () => <Sparkles size={20} className="animate-pulse text-cyan-400" />,
});

type ChatRole = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  dataSources?: string[];
  dataAsOf?: string;
  workDate?: string;
};

type OllamaChunk = {
  message?: { role?: string; content?: string };
  error?: string;
  done?: boolean;
};

type MemoryResponse = {
  success: boolean;
  error?: string;
  memoryEnabled?: boolean;
  conversation?: { id: string } | null;
  messages?: Array<{
    id: string;
    role: ChatRole;
    content: string;
    metadata?: { data_sources?: string[]; work_date?: string | null; data_as_of?: string | null };
  }>;
};

const QUICK_SUGGESTIONS = [
  "Tiến độ Delivery & Pickup Realtime hôm nay?",
  "Iphone WH hôm nay có vấn đề gì không?",
  "Backlog 7 ngày qua tăng hay giảm?",
  "Khu vực nào có tỷ lệ OH cao nhất?",
] as const;

const greeting: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Tôi có thể tổng hợp giao ca, gợi ý việc cần kiểm tra và trả lời theo dữ liệu được cấp quyền. Chọn phạm vi Dữ liệu vận hành hoặc Trang & lịch rider. Khi gửi câu hỏi, phần dữ liệu tương ứng được chuyển tới dịch vụ AI đã cấu hình; câu trả lời sẽ kèm nguồn và thời điểm.",
};

export function OllamaChatbox({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const globalOpen = useAiChatOpen();
  const [localOpen, setLocalOpen] = useState(initialOpen);
  const open = globalOpen || localOpen;
  const setOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof val === "function" ? val(open) : val;
    setLocalOpen(next);
    setAiChatOpen(next);
  }, [open]);
  const [contextMode, setContextMode] = useState<"operations" | "page">("operations");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeData, setIncludeData] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryBusy, setMemoryBusy] = useState(true);
  const aiConfig = useBrowserAiConfig();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai/memory?preferencesOnly=1", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as MemoryResponse;
        if (!response.ok || !result.success) throw new Error(result.error ?? "Không tải được AI Memory.");
        setMemoryEnabled(result.memoryEnabled ?? true);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Không tải được AI Memory.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMemoryBusy(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const initialPrompt = consumeInitialDraft();
    if (initialPrompt) {
      setDraft(initialPrompt);
    }
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (panelRef.current && event.target instanceof Node && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (messages.every(message => message.id === "welcome")) endRef.current?.parentElement?.scrollTo({ top: 0 });
    else endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [messages, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function sendMessage() {
    const content = draft.trim();
    if (!content || loading || memoryBusy) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    const conversation = [...messages.filter((message) => message.id !== "welcome"), userMessage].slice(-19);

    setDraft("");
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.map(({ role, content: value }) => ({ role, content: value })),
          includeData,
          contextMode,
          pagePath: `${window.location.pathname}${window.location.search}`,
          conversationId,
          aiConfig,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "AI nội bộ chưa sẵn sàng.");
      }

      const dataSources = (response.headers.get("X-Rider-Ops-Data-Sources") ?? "")
        .split(",")
        .filter((source) => source && source !== "none");
      const dataAsOf = response.headers.get("X-Rider-Ops-Data-As-Of") ?? undefined;
      const workDate = response.headers.get("X-Rider-Ops-Work-Date") ?? undefined;
      const responseConversationId = response.headers.get("X-Rider-Ops-Conversation-Id");
      if (responseConversationId && responseConversationId !== "none") setConversationId(responseConversationId);
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? { ...message, dataSources, dataAsOf: dataAsOf === "none" ? undefined : dataAsOf, workDate: workDate === "none" ? undefined : workDate }
          : message
      )));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: !done });
          }
          const lines = buffer.split(/\r?\n/);
          buffer = done ? "" : (lines.pop() ?? "");

          let hasNew = false;
          let isDoneChunk = false;
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let chunk: OllamaChunk;
            try {
              chunk = JSON.parse(trimmed) as OllamaChunk;
            } catch {
              continue;
            }
            if (chunk.error) throw new Error(chunk.error);
            if (chunk.done) {
              isDoneChunk = true;
            }
            if (chunk.message?.content) {
              answer += chunk.message.content;
              hasNew = true;
            }
          }
          if (hasNew) {
            setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content: answer } : message)));
          }

          if (done || isDoneChunk) break;
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      }

      if (!answer.trim()) throw new Error("AI không trả về nội dung.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setError(caught instanceof Error ? caught.message : "Không thể gửi câu hỏi đến AI nội bộ.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function resetChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([greeting]);
    setConversationId(null);
    setDraft("");
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  }

  async function restorePreviousChat() {
    if (memoryBusy || loading) return;
    setMemoryBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/memory", { cache: "no-store" });
      const result = await response.json() as MemoryResponse;
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không tải được cuộc trò chuyện trước.");
      setConversationId(result.conversation?.id ?? null);
      setMessages([greeting, ...(result.messages ?? []).map(message => ({
        id: message.id, role: message.role, content: message.content,
        dataSources: message.metadata?.data_sources,
        dataAsOf: message.metadata?.data_as_of ?? undefined,
        workDate: message.metadata?.work_date ?? undefined,
      }))]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được cuộc trò chuyện trước.");
    } finally {
      setMemoryBusy(false);
    }
  }

  async function toggleMemory() {
    if (memoryBusy) return;
    const nextValue = !memoryEnabled;
    setMemoryBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryEnabled: nextValue }),
      });
      const result = await response.json() as MemoryResponse;
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không cập nhật được AI Memory.");
      setMemoryEnabled(nextValue);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không cập nhật được AI Memory.");
    } finally {
      setMemoryBusy(false);
    }
  }

  async function clearMemory() {
    if (memoryBusy || !window.confirm("Xóa toàn bộ lịch sử AI của account này? Thao tác này không thể hoàn tác.")) return;
    setMemoryBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/memory", { method: "DELETE" });
      const result = await response.json() as MemoryResponse;
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không xóa được AI Memory.");
      resetChat();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xóa được AI Memory.");
    } finally {
      setMemoryBusy(false);
    }
  }

  return (
    <div ref={panelRef} className="relative z-[400]">
      {open && (
        <section
          id="ollama-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="ollama-chat-title"
          className="fixed right-4 sm:right-6 top-18 z-[500] flex flex-col w-[min(680px,calc(100vw-32px))] h-[min(740px,calc(100dvh-92px))] overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-[0_24px_80px_rgba(15,23,42,0.25)] backdrop-blur-xl text-slate-800 dark:text-slate-100 text-sm animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <header className="flex flex-shrink-0 items-center justify-between gap-4 px-5 py-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 backdrop-blur">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex size-11 shrink-0 items-center justify-center overflow-visible bg-transparent">
                <Nova3DBot size={42} isWaving interactive={false} />
              </div>
              <div>
                <p className="m-0 text-[10px] font-bold tracking-widest text-cyan-600 dark:text-cyan-400 uppercase">
                  SDD · NOVA 3D
                </p>
                <h2 id="ollama-chat-title" className="m-0 text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Nova · Trợ lý vận hành
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={resetChat}
                className="inline-grid size-9 place-items-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                aria-label="Tạo cuộc trò chuyện mới"
                title="Cuộc trò chuyện mới"
              >
                <RotateCcw size={17} aria-hidden="true" />
              </button>

              <details
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open");
                }}
              >
                <summary
                  className="inline-grid size-9 place-items-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors list-none cursor-pointer"
                  aria-label="Tùy chọn trợ lý"
                >
                  <MoreHorizontal size={19} aria-hidden="true" />
                </summary>
                <div className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => void restorePreviousChat()}
                    disabled={memoryBusy || loading}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <History size={16} aria-hidden="true" />Xem cuộc trò chuyện trước
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleMemory()}
                    disabled={memoryBusy}
                    aria-pressed={memoryEnabled}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Brain size={16} aria-hidden="true" />Ghi nhớ: {memoryEnabled ? "Đang bật" : "Đang tắt"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearMemory()}
                    disabled={memoryBusy}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 size={15} aria-hidden="true" />Xóa lịch sử AI
                  </button>
                </div>
              </details>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-grid size-9 place-items-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                aria-label="Đóng AI chat"
              >
                <X size={19} aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Main Body */}
          <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4" aria-live="polite" aria-busy={loading}>
              {!messages.some((message) => message.id !== "welcome") && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="relative mb-3 flex items-center justify-center">
                    {/* Live 3D Nova waving hello */}
                    <Nova3DBot size={110} isWaving interactive />
                    <div className="pointer-events-none absolute -bottom-2 h-4 w-28 rounded-full bg-cyan-400/20 blur-md dark:bg-cyan-400/30" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Xin chào! Tôi là Nova 🤖</h3>
                  <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Trợ lý 3D thông minh của bạn. Hỏi tôi về backlog, OH, hàng qua đêm, Return, đơn iPhone/WH hoặc lịch FTE.
                  </p>
                  <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Gợi ý câu hỏi">
                    {QUICK_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setDraft(suggestion);
                          inputRef.current?.focus();
                        }}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/80 p-3 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50/40 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:bg-slate-800"
                      >
                        <span>{suggestion}</span>
                        <ArrowUpRight size={15} className="shrink-0 text-cyan-600 dark:text-cyan-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.filter((message) => message.id !== "welcome").map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "w-full flex gap-3 text-xs sm:text-[13px]",
                    message.role === "user" ? "justify-end pl-8 sm:pl-16" : "justify-start pr-2"
                  )}
                  data-role={message.role}
                >
                  {message.role === "assistant" && (
                    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-visible bg-transparent pt-0.5">
                      <Nova3DBot size={34} isWaving={false} interactive={false} />
                    </span>
                  )}
                  {message.role === "user" ? (
                    <div className="max-w-[85%] shrink-0 w-fit rounded-2xl rounded-tr-sm bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-white shadow-md shadow-blue-500/15 [overflow-wrap:anywhere] break-words leading-relaxed font-normal">
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-800/80 dark:bg-slate-850/80 shadow-[0_4px_16px_rgba(15,23,42,0.03)] backdrop-blur-sm">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-200/60 pb-1.5 dark:border-slate-800/60">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
                            NOVA AI
                          </span>
                          <span className="rounded bg-cyan-100/70 px-1.5 py-0.5 text-[9px] font-bold text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300">
                            TRỢ LÝ 3D
                          </span>
                        </div>
                      </div>
                      {message.content ? (
                        <NovaMarkdown
                          content={message.content}
                          isStreaming={loading && message.id === messages.at(-1)?.id}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2 text-slate-400 text-xs py-1">
                          <LoaderCircle size={15} className="animate-spin text-cyan-500" aria-hidden="true" />
                          Nova đang đọc và phân tích dữ liệu…
                        </span>
                      )}

                      {message.dataSources?.length ? (
                        <div className="mt-3.5 flex items-start gap-1.5 border-t border-slate-200/70 pt-2.5 text-[10px] text-slate-400 dark:border-slate-800">
                          <Database size={12} className="shrink-0 mt-0.5 text-cyan-500" aria-hidden="true" />
                          <span>
                            {message.workDate ?? "—"} · Đọc lúc {formatContextTime(message.dataAsOf)}
                            <br />
                            {message.dataSources
                              .map(
                                (source) =>
                                  ({
                                    riders: "Danh bạ rider",
                                    delivery: "Delivery",
                                    pickup: "Pickup",
                                    team: "Lịch FTE",
                                    wh_tracking: "WH / iPhone",
                                    matched_riders_realtime: "Hồ sơ Rider Realtime",
                                    analysis_delivery_realtime: "Delivery Realtime",
                                    analysis_pickup_realtime: "Pickup Realtime",
                                    analysis_backlog_delivery: "Backlog Delivery",
                                    analysis_backlog_pickup: "Backlog Pickup",
                                    analysis_oh: "OH",
                                    analysis_volume: "Delivery Volume",
                                    analysis_overnight: "Giữ qua đêm",
                                    analysis_fc: "Inbound & FC",
                                    analysis_return: "Return",
                                    analysis_return_history: "Lịch sử Return",
                                  }[source] ?? source)
                              )
                              .join(" · ")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
              <div ref={endRef} />
            </div>

            {/* Composer Area */}
            <div className="flex-shrink-0 border-t border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
              {error && (
                <p role="alert" className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                  {error}
                </p>
              )}
              {messages.some((message) => message.role === "user") && (
                <details className="mb-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                    Gợi ý câu hỏi
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setDraft(suggestion);
                          inputRef.current?.focus();
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-cyan-400 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </details>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-850">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!loading) void sendMessage();
                    }
                  }}
                  disabled={false}
                  rows={2}
                  maxLength={4000}
                  placeholder={loading ? "Nova đang trả lời… (bạn có thể gõ sẵn câu tiếp theo)" : "Hỏi Nova về backlog, OH, Return hoặc lịch FTE…"}
                  aria-label="Nội dung gửi AI"
                  className="w-full resize-none bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    aria-pressed={includeData}
                    disabled={loading}
                    onClick={() => setIncludeData((current) => !current)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      includeData
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    )}
                  >
                    <Database size={12} aria-hidden="true" />
                    Dữ liệu: {includeData ? "Bật" : "Tắt"}
                  </button>
                  <button
                    type="button"
                    disabled={!loading && (memoryBusy || !draft.trim())}
                    onClick={() => {
                      if (loading) {
                        abortRef.current?.abort();
                        setLoading(false);
                      } else {
                        void sendMessage();
                      }
                    }}
                    aria-label={loading ? "Dừng phản hồi" : "Gửi câu hỏi"}
                    title={loading ? "Bấm để dừng phản hồi AI" : "Gửi câu hỏi"}
                    className={cn(
                      "inline-grid size-8 place-items-center rounded-lg shadow-sm transition",
                      loading
                        ? "bg-rose-500 text-white hover:bg-rose-600 cursor-pointer"
                        : "bg-cyan-600 text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                    )}
                  >
                    {loading ? (
                      <Square size={13} className="fill-current" aria-hidden="true" />
                    ) : (
                      <Send size={15} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <label className="flex items-center gap-1.5">
                  <span>Phạm vi:</span>
                  <select
                    aria-label="Phạm vi dữ liệu AI"
                    value={contextMode}
                    disabled={loading || !includeData}
                    onChange={(event) => setContextMode(event.target.value as "operations" | "page")}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="operations">Dữ liệu vận hành</option>
                    <option value="page">Trang & lịch rider</option>
                  </select>
                </label>
                <span>Enter gửi · Shift+Enter xuống dòng</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 text-center">
                Nova đọc dữ liệu vận hành khi bạn gửi câu hỏi. Đối chiếu nguồn trước khi điều phối.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function formatContextTime(value?: string) {
  if (!value) return "chưa có snapshot";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}
