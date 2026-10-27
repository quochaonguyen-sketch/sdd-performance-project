"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useProductUpdates } from "./use-product-updates";
import styles from "./feedback.module.css";

export function ProductUpdateNotifications() {
  const { updates, feedbackNotifications, error } = useProductUpdates();
  const privateCount = feedbackNotifications.filter(item => !item.read).length;
  const count = updates.filter(item => !item.read).length + privateCount;
  const label = error ? "Không tải được thông báo cập nhật. Mở để thử lại." : `Cập nhật hệ thống${count ? `: ${count} thông báo chưa đọc` : ""}`;
  return <Link href={privateCount ? "/feedback#feedback-notifications" : "/feedback#updates"} className={styles.bell} title={label} aria-label={label}>
    <Bell size={18} aria-hidden="true" />
    {count > 0 ? <span className={styles.count} aria-hidden="true">{count}</span> : error ? <span aria-hidden="true">!</span> : null}
  </Link>;
}
