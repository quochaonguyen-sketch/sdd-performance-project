"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { useCallback, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Bug, Check, CheckCircle2, ChevronDown, Clock3, Inbox, Lightbulb, MessageSquare, Megaphone, Plus, ShieldCheck, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { feedbackStatuses, type Feedback } from "@/lib/feedback/model";
import { FEEDBACK_PAGE_SIZE, type FeedbackListQuery } from "@/lib/feedback/query";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { FeedbackForm } from "./feedback-form";
import { useProductUpdates } from "./use-product-updates";
import styles from "./feedback.module.css";

async function send(url: string, method: string, body?: object) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Thao tác chưa thành công. Vui lòng thử lại.");
  return payload;
}
const date = (value: string) => new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" });

export function FeedbackView() {
  const [query, setQuery] = useRememberedState<FeedbackListQuery>("feedback-view:query", { page: 1, status: "ALL", search: "", feedback_id: "" });
  const [searchInput, setSearchInput] = useRememberedState("feedback-view:searchInput", "");
  const queryKey = JSON.stringify(query);
  const [result, setResult] = useState<{ key: string; feedback: Feedback[]; total: number; isAdmin: boolean } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const feedback = result?.key === queryKey ? result.feedback : [];
  const total = result?.key === queryKey ? result.total : 0;
  const isAdmin = result?.isAdmin ?? false;
  const loadError = failure?.key === queryKey ? failure.message : "";
  const loading = result?.key !== queryKey && !loadError;
  const totalPages = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", content: "" });
  const publishRef = useRef<HTMLDetailsElement>(null);
  const updates = useProductUpdates();
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const params = new URLSearchParams({ page: String(query.page), status: query.status, search: query.search, feedback_id: query.feedback_id });
      const response = await fetch(`/api/feedback?${params}`, { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không tải được phản hồi.");
      if (signal.aborted) return;
      const lastPage = Math.max(1, Math.ceil(payload.total / FEEDBACK_PAGE_SIZE));
      if (query.page > lastPage) { setQuery({ ...query, page: lastPage }); return; }
      setResult({ key: queryKey, feedback: payload.feedback, total: payload.total, isAdmin: payload.isAdmin });
      setFailure(null);
    } catch {
      if (!signal.aborted) setFailure({ key: queryKey, message: "Không tải được phản hồi. Vui lòng thử lại." });
    }
  }, [query, queryKey, setQuery]);
  const refreshFeedback = useVisiblePolling(load, "feedback-changed");

  async function action(key: string, work: () => Promise<void>, message: string) {
    setBusy(key); setError(""); setNotice("");
    try { await work(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể kết nối. Vui lòng thử lại."); }
    finally { setBusy(null); }
  }


  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerCopy}><span className={styles.eyebrow}><span /> LẮNG NGHE ĐỂ CẢI TIẾN</span><h1>Báo lỗi <span>& góp ý.</span></h1><p>Mỗi phản hồi giúp trải nghiệm làm việc tốt hơn.<br />Gửi vấn đề bạn gặp, chúng tôi cùng bạn giải quyết.</p></div>
      <a className={styles.headerLink} href="#feedback-history">Theo dõi phản hồi <ArrowDown size={16} aria-hidden="true" /></a>
    </header>
    <div className={styles.overview} aria-label="Tổng quan phản hồi trên trang hiện tại">
      {[{ icon: MessageSquare, label: "Phản hồi trên trang này", count: feedback.length }, { icon: Clock3, label: "Đang xử lý · trang này", count: feedback.filter(item => item.status === "OPEN" || item.status === "IN_PROGRESS").length }, { icon: CheckCircle2, label: "Hoàn tất · trang này", count: feedback.filter(item => item.status === "RESOLVED").length }].map(({ icon: Icon, label, count }) => <div key={label} className={styles.metric}><Icon size={19} aria-hidden="true" /><div><strong>{loading || loadError ? "—" : String(count).padStart(2, "0")}</strong><span>{label}</span></div></div>)}
      <p className={styles.overviewNote}><ShieldCheck size={16} aria-hidden="true" /> Phản hồi riêng tư.<br />Cải tiến cho mọi người.</p>
    </div>
    <div role="status" aria-live="polite" className={notice ? styles.notice : undefined}>{notice ? <p className={styles.success}><CheckCircle2 size={18} aria-hidden="true" />{notice}</p> : null}</div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.grid}>
      <section id="feedback-form" className={`${styles.panel} ${styles.composer}`} aria-labelledby="feedback-form-title"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><MessageSquare size={21} aria-hidden="true" /></span><div><span className={styles.sectionNumber}>01 / CHIA SẺ VỚI CHÚNG TÔI</span><h2 id="feedback-form-title">Gửi phản hồi</h2></div></div><p className={styles.muted}>Một lỗi cần sửa hay một ý tưởng mới? Chúng tôi luôn lắng nghe.</p>
        <FeedbackForm disabled={busy !== null} />
      </section>
      <section id="updates" className={`${styles.panel} ${styles.updatesPanel}`} aria-labelledby="updates-title"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><Megaphone size={21} aria-hidden="true" /></span><div><span className={styles.sectionNumber}>02 / CÓ GÌ MỚI?</span><h2 id="updates-title">Cập nhật hệ thống</h2></div><span className={styles.unreadCount}>{updates.updates.filter(item => !item.read).length} chưa đọc</span></div><p className={styles.muted}>Những lỗi đã sửa. Những trải nghiệm đang tốt lên.</p>
        {isAdmin ? <details ref={publishRef} className={styles.publishDetails}><summary><Plus size={17} aria-hidden="true" /> Soạn thông báo mới<ChevronDown size={16} aria-hidden="true" /></summary><form className={styles.publish} onSubmit={event => {
          event.preventDefault();
          void action("publish", async () => { await send("/api/product-updates", "POST", draft); setDraft({ title: "", content: "" }); window.dispatchEvent(new Event("product-updates-changed")); }, "Đã đăng thông báo cho tất cả người dùng.");
        }}><h3>Đăng thông báo cho người dùng</h3><p className={styles.muted}>Nội dung này hiển thị với tất cả tài khoản. Kiểm tra và bỏ thông tin riêng trước khi đăng.</p><label>Tiêu đề thông báo<input required minLength={3} maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label>Nội dung thông báo<textarea required minLength={10} maxLength={5000} rows={4} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} /></label><button type="submit" disabled={busy !== null} className={styles.primary}>{busy === "publish" ? "Đang đăng…" : "Đăng thông báo"}<ArrowUpRight size={16} aria-hidden="true" /></button></form></details> : null}
        {updates.error ? <p role="alert" className={styles.error}>{updates.error} <button onClick={() => void updates.refresh()}>Thử lại</button></p> : updates.loading ? <p role="status">Đang tải thông báo…</p> : updates.updates.length === 0 ? <div className={styles.empty}><Megaphone size={28} aria-hidden="true" /><h3>Chưa có thông báo mới</h3><p>Các bản sửa lỗi và cải tiến sẽ xuất hiện tại đây.</p></div> : null}
        <div className={styles.timeline}>{updates.updates.map(item => <article className={styles.update} key={item.id} data-unread={!item.read}><div className={styles.meta}><time dateTime={item.created_at}>{date(item.created_at)}</time>{!item.read ? <span className={styles.newBadge}>Mới</span> : null}</div><h3>{item.title}</h3><p className={styles.content}>{item.content}</p>{!item.read ? <button className={styles.readButton} disabled={busy !== null} onClick={() => void action(item.id, async () => { await send(`/api/product-updates/${item.id}/read`, "POST"); window.dispatchEvent(new Event("product-updates-changed")); }, "Đã đánh dấu thông báo là đã đọc.")}>Đánh dấu đã đọc<Check size={14} aria-hidden="true" /></button> : <small className={styles.readState}><Check size={14} aria-hidden="true" />Đã đọc</small>}</article>)}</div>
        <div className={styles.feedFooter}><span className={styles.liveDot} /><small>50 thông báo gần nhất · Cập nhật mỗi phút</small></div>
      </section>
    </div>
    {updates.feedbackNotifications.length ? <section id="feedback-notifications" className={`${styles.panel} ${styles.history}`} aria-labelledby="private-notifications-title"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><MessageSquare size={21} aria-hidden="true" /></span><div><span className={styles.sectionNumber}>CHỈ DÀNH CHO BẠN</span><h2 id="private-notifications-title">Thông báo phản hồi</h2></div></div><div className={styles.timeline}>{updates.feedbackNotifications.map(item => <article className={styles.update} key={item.id} data-unread={!item.read}><div className={styles.meta}><time dateTime={item.created_at}>{date(item.created_at)}</time><span className={styles.badge} data-status={item.status}>{feedbackStatuses[item.status]}</span>{!item.read ? <span className={styles.newBadge}>Mới</span> : null}</div><h3>{item.title}</h3><p className={styles.content}>{item.response || "Quản trị viên đã cập nhật trạng thái phản hồi của bạn."}</p><div className={styles.row}><a href="#feedback-history" onClick={() => { setSearchInput(""); setQuery({ page: 1, status: "ALL", search: "", feedback_id: item.feedback_id }); }}>Xem phản hồi<ArrowDown size={14} aria-hidden="true" /></a>{!item.read ? <button disabled={busy !== null} onClick={() => void action(item.id, async () => { await send(`/api/feedback-notifications/${item.id}/read`, "POST"); window.dispatchEvent(new Event("product-updates-changed")); }, "Đã đọc thông báo phản hồi.")}>Đánh dấu đã đọc</button> : <small className={styles.readState}><Check size={14} aria-hidden="true" />Đã đọc</small>}</div></article>)}</div><small className={styles.muted}>50 thông báo riêng gần nhất.</small></section> : null}
    <section id="feedback-history" className={`${styles.panel} ${styles.history}`} aria-labelledby="history-title"><div className={styles.row}><div><span className={styles.sectionNumber}>03 / TIẾN ĐỘ XỬ LÝ</span><h2 id="history-title">{isAdmin ? "Quản lý phản hồi" : "Phản hồi của bạn"}<span className={styles.totalCount}>{loading || loadError ? "—" : total}</span></h2><p className={styles.muted}>{isAdmin ? "Tiếp nhận, phản hồi và cập nhật tiến độ xử lý." : "Mọi phản hồi đều được ghi nhận. Theo dõi tiến độ tại đây."}</p></div><label>Lọc trạng thái<select value={query.status} onChange={e => setQuery({ ...query, page: 1, status: e.target.value as FeedbackListQuery["status"], feedback_id: "" })}><option value="ALL">Tất cả trạng thái</option>{Object.entries(feedbackStatuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
      {query.feedback_id ? <p className={styles.muted}>Đang xem phản hồi được chọn từ thông báo. <button type="button" onClick={() => setQuery({ ...query, page: 1, feedback_id: "" })}>Xem tất cả phản hồi</button></p> : null}
      <form className={styles.searchBar} role="search" aria-label="Tìm phản hồi" onSubmit={event => { event.preventDefault(); setQuery({ ...query, page: 1, search: searchInput.trim(), feedback_id: "" }); }}>
        <label htmlFor="feedback-search">Tìm theo tiêu đề hoặc nội dung</label><div><Search size={18} aria-hidden="true" /><input id="feedback-search" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={160} placeholder="Nhập từ khóa cần tìm…" /><button type="submit">Tìm kiếm</button></div>
      </form>
      {loadError ? <p role="alert" className={styles.error}>{loadError} <button onClick={() => void refreshFeedback()}>Thử lại</button></p> : null}
      {loading ? <p role="status">Đang tải phản hồi…</p> : <>
        {!loadError && feedback.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}><Inbox size={28} aria-hidden="true" /></span><h3>Chưa có phản hồi trong danh sách này</h3><p>Mỗi cải tiến bắt đầu từ một chia sẻ.<br />Gửi báo lỗi hoặc góp ý bằng biểu mẫu phía trên.</p></div> : null}
        <div className={styles.list}>{feedback.map(item => <article key={item.id} className={styles.ticket}>
          <div className={styles.meta}>{item.kind === "BUG" ? <Bug size={15} aria-hidden="true" /> : <Lightbulb size={15} aria-hidden="true" />}<span>{item.kind === "BUG" ? "Báo lỗi" : "Góp ý"}</span><span className={styles.badge} data-status={item.status}>{feedbackStatuses[item.status]}</span><time dateTime={item.created_at}>{date(item.created_at)}</time></div>
          <h3>{item.title}</h3>{isAdmin ? <p className={styles.muted}>Người gửi: {item.author_name}</p> : null}{item.page_path ? <p className={styles.muted}>Trang: {item.page_path}</p> : null}<p className={styles.content}>{item.content}</p>
          {item.response ? <div className={styles.reply}><strong>Phản hồi từ quản trị viên</strong><p className={styles.content}>{item.response}</p></div> : null}
          {isAdmin ? <form className={styles.review} key={`${item.status}:${item.response}`} onSubmit={event => {
            event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
            void action(item.id, async () => { await send(`/api/feedback/${item.id}`, "PATCH", values); await refreshFeedback(); }, "Đã lưu trạng thái và phản hồi.");
          }}><label>Trạng thái<select name="status" defaultValue={item.status}>{Object.entries(feedbackStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Phản hồi cho người gửi<textarea name="response" defaultValue={item.response} maxLength={5000} rows={3} /></label><div className={styles.row}><button type="submit" disabled={busy !== null}>Lưu xử lý</button>{item.status === "RESOLVED" ? <a href="#updates" onClick={() => { setDraft({ title: `Đã sửa: ${item.title}`.slice(0, 160), content: "" }); if (publishRef.current) publishRef.current.open = true; }}>Soạn thông báo đã sửa lỗi<ArrowUpRight size={15} aria-hidden="true" /></a> : null}</div></form> : null}
        </article>)}</div>
        <nav className={styles.pagination} aria-label="Phân trang phản hồi"><p role="status">{total ? `Hiển thị ${(query.page - 1) * FEEDBACK_PAGE_SIZE + 1}–${(query.page - 1) * FEEDBACK_PAGE_SIZE + feedback.length} / ${total} phản hồi` : "0 phản hồi"}</p><div><button type="button" aria-label="Trang trước" disabled={loading || busy !== null || query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}><ChevronLeft size={16} aria-hidden="true" />Trước</button><span>Trang {query.page} / {totalPages}</span><button type="button" aria-label="Trang sau" disabled={loading || busy !== null || query.page >= totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Sau<ChevronRight size={16} aria-hidden="true" /></button></div></nav></>}
    </section>
  </div>;
}
