"use client";

import { useId, useState, type FormEvent } from "react";
import { Bug, Check, CheckCircle2, Lightbulb, Send, ShieldCheck } from "lucide-react";
import styles from "./feedback.module.css";

export function FeedbackForm({ pagePath = "", disabled = false }: { pagePath?: string; disabled?: boolean }) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true); setError(""); setSuccess(false);
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chưa gửi được phản hồi. Vui lòng thử lại.");
      form.reset(); setSuccess(true);
      window.dispatchEvent(new Event("feedback-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể kết nối. Nội dung được giữ để bạn thử lại."); }
    finally { setPending(false); }
  }
  return <>
    <div role="status" aria-live="polite">{success ? <p className={styles.success}><CheckCircle2 size={18} aria-hidden="true" />Đã gửi phản hồi. Cảm ơn bạn đã góp ý!</p> : null}</div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <form className={styles.form} onSubmit={submitFeedback}>
          <fieldset className={styles.kindPicker}><legend>Bạn muốn chia sẻ điều gì?</legend><div className={styles.kindOptions}><label><input type="radio" name="kind" value="BUG" defaultChecked /><span className={styles.kindCard}><Bug size={21} aria-hidden="true" /><strong>Báo lỗi</strong><small>Có điều chưa hoạt động</small><Check size={14} className={styles.kindCheck} aria-hidden="true" /></span></label><label><input type="radio" name="kind" value="SUGGESTION" /><span className={styles.kindCard}><Lightbulb size={21} aria-hidden="true" /><strong>Góp ý</strong><small>Một ý tưởng cải tiến</small><Check size={14} className={styles.kindCheck} aria-hidden="true" /></span></label></div></fieldset>
          <label>Tiêu đề<input name="title" required minLength={3} maxLength={160} placeholder="Ví dụ: Không tải được danh sách rider" /></label>
          <div><label>Trang gặp vấn đề <span className={styles.muted}>(không bắt buộc)</span><input name="page_path" defaultValue={pagePath} maxLength={300} placeholder="/riders" aria-describedby={`${id}-path-help`} /></label><small id={`${id}-path-help`}>Chỉ nhập đường dẫn, không kèm thông tin đăng nhập.</small></div>
          <div><label>Nội dung<textarea name="content" required minLength={10} maxLength={5000} rows={6} placeholder="Bạn đang làm gì? Lỗi xuất hiện như thế nào? Hoặc bạn muốn cải thiện điều gì?" aria-describedby={`${id}-content-help`} /></label><small id={`${id}-content-help`}>Từ 10 đến 5.000 ký tự. Không gửi mật khẩu hoặc dữ liệu nhạy cảm.</small></div>
          <div className={styles.formFooter}><p><ShieldCheck size={15} aria-hidden="true" />Chỉ bạn và quản trị viên xem được.</p><button disabled={pending || disabled} type="submit" className={styles.primary}>{pending ? "Đang gửi…" : "Gửi phản hồi"}<Send size={16} aria-hidden="true" /></button></div>
        </form>
  </>;
}
