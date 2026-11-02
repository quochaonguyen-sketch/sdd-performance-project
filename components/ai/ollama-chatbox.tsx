"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Brain, Database, History, LoaderCircle, MoreHorizontal, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { useBrowserAiConfig } from "@/lib/ai/browser-config";
import s from "./ai-workspace.module.css";

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

const QUICK_SUGGESTIONS = ["Backlog 7 ngày qua tăng hay giảm?", "Khu vực nào có tỷ lệ OH cao nhất?", "Khu vực nào đang tồn hàng trả nhiều?"] as const;

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
  const [open, setOpen] = useState(initialOpen);
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
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

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

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as OllamaChunk;
          if (chunk.error) throw new Error(chunk.error);
          answer += chunk.message?.content ?? "";
          setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content: answer } : message)));
        }

        if (done) break;
      }

      if (!answer.trim()) throw new Error("AI không trả về nội dung.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setError(caught instanceof Error ? caught.message : "Không thể gửi câu hỏi đến AI nội bộ.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
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

  return <div ref={panelRef} className="relative z-[400]">
    {open && <section id="ollama-chat-panel" role="dialog" aria-modal="false" aria-labelledby="ollama-chat-title" className={`${s.panel} ${s.chatPanel}`}>
      <header className={s.header}>
        <div className={s.identity}><span className={s.brandIcon}><Sparkles size={22} aria-hidden="true" /></span><div><p className={s.eyebrow}>SDD · AI WORKSPACE</p><h2 id="ollama-chat-title" className={s.title}>Trợ lý vận hành</h2></div></div>
        <div className={s.headerActions}>
          <button type="button" onClick={resetChat} className={s.iconButton} aria-label="Tạo cuộc trò chuyện mới" title="Cuộc trò chuyện mới"><RotateCcw size={17} aria-hidden="true" /></button>
          <details className={s.menu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}>
            <summary className={s.iconButton} aria-label="Tùy chọn trợ lý"><MoreHorizontal size={19} aria-hidden="true" /></summary>
            <div className={s.menuContent}><button type="button" onClick={() => void restorePreviousChat()} disabled={memoryBusy || loading}><History size={16} aria-hidden="true" />Xem cuộc trò chuyện trước</button><button type="button" onClick={() => void toggleMemory()} disabled={memoryBusy} aria-pressed={memoryEnabled} aria-label={memoryEnabled ? "Tắt ghi nhớ theo account" : "Bật ghi nhớ theo account"}><Brain size={16} aria-hidden="true" />Ghi nhớ: {memoryEnabled ? "Đang bật" : "Đang tắt"}</button><button type="button" onClick={() => void clearMemory()} disabled={memoryBusy} className={s.danger} aria-label="Xóa lịch sử AI của account"><Trash2 size={15} aria-hidden="true" />Xóa lịch sử AI</button></div>
          </details>
          <button type="button" onClick={() => setOpen(false)} className={s.iconButton} aria-label="Đóng AI chat"><X size={19} aria-hidden="true" /></button>
        </div>
      </header>
      <div className={s.layout}>
        <div className={s.main}>
            <div className={s.chatScroll} aria-live="polite" aria-busy={loading}>
              {!messages.some(message => message.id !== "welcome") && <div className={s.chatIntro}><h3>Bạn muốn phân tích điều gì?</h3><p>Hỏi về backlog, OH, hàng qua đêm, Return hoặc lịch FTE. Tôi sẽ đọc dữ liệu phù hợp và trả lời sau khi bạn gửi câu hỏi.</p><div className={s.suggestions} aria-label="Gợi ý câu hỏi">{QUICK_SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" disabled={loading} onClick={() => { setDraft(suggestion); inputRef.current?.focus(); }}>{suggestion}<ArrowUpRight size={16} aria-hidden="true" /></button>)}</div></div>}
              {messages.filter(message => message.id !== "welcome").map(message => <article key={message.id} className={s.message} data-role={message.role}>
                {message.role === "assistant" && <span className={s.messageAvatar}><Sparkles size={15} aria-hidden="true" /></span>}
                <div className={s.messageContent}>{message.role === "assistant" && <span className={s.messageName}>TRỢ LÝ SDD</span>}{message.content ? <p className={s.messageText}>{message.content}</p> : <span className={s.thinking}><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Đang đọc và phân tích…</span>}
                  {message.role === "assistant" && message.dataSources?.length ? <div className={s.messageSources}><Database size={12} aria-hidden="true" /><span>{message.workDate ?? "—"} · Đọc lúc {formatContextTime(message.dataAsOf)}<br />{message.dataSources.map(source => ({riders:"Danh bạ rider",delivery:"Delivery",pickup:"Pickup",team:"Lịch FTE",analysis_backlog_delivery:"Backlog Delivery",analysis_backlog_pickup:"Backlog Pickup",analysis_oh:"OH",analysis_volume:"Delivery Volume",analysis_overnight:"Giữ qua đêm",analysis_fc:"Inbound & FC",analysis_return:"Return",analysis_return_history:"Lịch sử Return"} as Record<string,string>)[source] ?? source).join(" · ")}</span></div> : null}
                </div>
              </article>)}
              <div ref={endRef} />
            </div>
            <div className={s.composerArea}>
              {error && <p role="alert" className={s.error}>{error}</p>}
              {messages.some(message => message.role === "user") && <details className={s.suggestionMenu}><summary>Gợi ý câu hỏi</summary><div className={s.suggestions}>{QUICK_SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" disabled={loading} onClick={() => { setDraft(suggestion); inputRef.current?.focus(); }}>{suggestion}<ArrowUpRight size={15} aria-hidden="true" /></button>)}</div></details>}
              <div className={s.composer}>
                <textarea ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={loading} rows={2} maxLength={4000} placeholder="Hỏi về backlog, OH, Return hoặc lịch FTE…" aria-label="Nội dung gửi AI" />
                <div className={s.composerTools}><button type="button" aria-pressed={includeData} disabled={loading} onClick={() => setIncludeData(current => !current)} className={s.dataToggle}><Database size={13} aria-hidden="true" />Dữ liệu: {includeData ? "Bật" : "Tắt"}</button><button type="button" disabled={loading || memoryBusy || !draft.trim()} onClick={() => void sendMessage()} className={s.send} aria-label="Gửi câu hỏi">{loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}</button></div>
              </div>
              <div className={s.scope}><label>Phạm vi <select aria-label="Phạm vi dữ liệu AI" value={contextMode} disabled={loading || !includeData} onChange={event => setContextMode(event.target.value as "operations" | "page")}><option value="operations">Dữ liệu vận hành</option><option value="page">Trang & lịch rider</option></select></label><span>Enter gửi · Shift + Enter xuống dòng</span></div>
              <p className={s.footnote}>AI đọc dữ liệu vận hành khi bạn gửi câu hỏi. Đối chiếu nguồn trước khi điều phối.</p>
            </div>
        </div>
      </div>
    </section>}
    <button type="button" aria-expanded={open} aria-controls="ollama-chat-panel" aria-label={open ? "Đóng Rider Ops AI" : "Mở Rider Ops AI"} title="Rider Ops AI" onClick={() => setOpen(current => !current)} className="group relative inline-grid size-10 shrink-0 place-items-center rounded-xl border border-blue-400/50 bg-blue-600 text-sm font-semibold text-white outline-none transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 xl:inline-flex xl:w-auto xl:gap-2 xl:px-3 dark:focus-visible:ring-offset-slate-950">{open ? <X size={19} aria-hidden="true" /> : <Sparkles size={19} aria-hidden="true" />}<span className="hidden whitespace-nowrap xl:inline">{open ? "Đóng AI" : "Bật AI"}</span><span className="sr-only">{open ? "Đóng Rider Ops AI" : "Mở Rider Ops AI"}</span></button>
  </div>;
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
