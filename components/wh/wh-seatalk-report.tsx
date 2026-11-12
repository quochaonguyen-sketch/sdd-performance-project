"use client";

import Image from "next/image";
import { Send } from "lucide-react";
import { useRef, useState } from "react";
import styles from "./wh.module.css";

const endpoint = "/api/wh-dashboard/seatalk";
type Preview = { snapshotAt: string; stamp: string; orders: number; images: number; configured: boolean };

export function WhSeatalkReport() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPreview() {
    setPreview(null);
    setIndex(0);
    setLoading(true);
    setError("");
    setMessage("");
    setImageError(false);
    setUnconfirmed(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setPreview(body);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Chưa tải được bản xem trước.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!preview || sending) return;
    setSending(true);
    setError("");
    setMessage("");
    let retryUnconfirmed = unconfirmed;
    try {
      for (;;) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotAt: preview.snapshotAt, retryUnconfirmed }),
        });
        const body = await response.json();
        if (response.status === 202) {
          setMessage(`Đã xác nhận ${body.images}/${preview.images} ảnh. Đang gửi tiếp…`);
          retryUnconfirmed = false;
          continue;
        }
        setUnconfirmed(body.unconfirmed === true);
        if (!response.ok) throw new Error(body.error);
        setMessage(body.alreadySent
          ? `Báo cáo này đã có trên SeaTalk (${body.images} ảnh).`
          : `Đã gửi ${body.images} ảnh vào luồng báo cáo HV hôm nay trên SeaTalk.`);
        break;
      }
    } catch (error) {
      setMessage("");
      setError(error instanceof Error ? error.message : "Chưa gửi được báo cáo HV.");
    } finally {
      setSending(false);
    }
  }

  const imageLabel = index === 0 ? "Dashboard · Tổng quan theo khu vực" : `Rider Delivery · Trang ${index}/${(preview?.images ?? 1) - 1}`;
  return <>
    <button type="button" onClick={() => { dialog.current?.showModal(); void loadPreview(); }} disabled={loading}>
      <Send size={16} aria-hidden="true" /> Gửi HV qua SeaTalk
    </button>
    <dialog ref={dialog} className={styles.seatalkDialog} aria-labelledby="wh-seatalk-title"
      onCancel={event => { if (sending) event.preventDefault(); }}>
      <h2 id="wh-seatalk-title">Gửi báo cáo HV qua SeaTalk</h2>
      <p>Toàn bộ Hub 4232 trong ngày hôm nay, gồm Dashboard và Rider Delivery.</p>
      {loading && <p role="status">Đang tải bản xem trước…</p>}
      {preview && <>
        <p>{preview.stamp} · {preview.orders} đơn · {preview.images} ảnh</p>
        <div className={styles.seatalkPreviewControls}>
          <button type="button" disabled={index === 0} onClick={() => { setImageError(false); setIndex(index - 1); }}>Ảnh trước</button>
          <strong aria-live="polite">{imageLabel}</strong>
          <button type="button" disabled={index + 1 >= preview.images} onClick={() => { setImageError(false); setIndex(index + 1); }}>Ảnh sau</button>
        </div>
        <div className={styles.seatalkPreview} tabIndex={0} role="region" aria-label="Ảnh xem trước, cuộn để xem chi tiết">
          {imageError ? <p role="alert">Không tải được ảnh này. Hãy tải lại bản xem trước.</p> :
            <Image unoptimized src={`${endpoint}?image=${index}&snapshotAt=${encodeURIComponent(preview.snapshotAt)}`}
              width={1440} height={480} alt={imageLabel} onError={() => setImageError(true)} />}
        </div>
        {!preview.configured && <p className={styles.notice}>Máy chủ chưa cấu hình SeaTalk Bot.</p>}
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.notice} role="status">{message}</p>}
      <footer className={styles.seatalkFooter}>
        <button type="button" onClick={() => dialog.current?.close()} disabled={sending}>Đóng</button>
        <button type="button" onClick={() => void loadPreview()} disabled={loading || sending}>Tải lại bản xem trước</button>
        <button type="button" className={styles.primary} disabled={!preview?.configured || loading || sending || imageError || !!message}
          onClick={() => void send()}>
          <Send size={16} aria-hidden="true" /> {sending ? "Đang gửi…" : unconfirmed ? "Tiếp tục gửi" : "Gửi vào nhóm SeaTalk"}
        </button>
      </footer>
    </dialog>
  </>;
}
