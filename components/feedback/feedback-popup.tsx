"use client";

import { useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import { FeedbackForm } from "./feedback-form";
import styles from "./feedback.module.css";

export function FeedbackPopup() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pathname = usePathname();
  return <>
    <button type="button" className="app-feedback-link" title="Báo lỗi & góp ý" aria-label="Báo lỗi & góp ý" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><MessageSquarePlus size={18} aria-hidden="true" /></button>
    <dialog ref={dialog} className={styles.popup} aria-labelledby={titleId} aria-describedby={descriptionId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={`${styles.page} ${styles.popupBody}`}>
        <div className={styles.popupHeading}><div><span className={styles.sectionNumber}>CHIA SẺ VỚI CHÚNG TÔI</span><h2 id={titleId}>Báo lỗi & góp ý</h2></div><button type="button" aria-label="Đóng góp ý" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></div>
        <p id={descriptionId} className={styles.muted}>Gửi phản hồi ngay tại đây. Chỉ bạn và quản trị viên xem được.</p>
        <FeedbackForm pagePath={pathname} />
      </div>
    </dialog>
  </>;
}
