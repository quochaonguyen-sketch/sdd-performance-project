"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SpxOrderLink({ shipmentId }: { shipmentId: string }) {
  if (!shipmentId.trim()) return null;
  const href = `https://spx.shopee.vn/#/orderDetail/${encodeURIComponent(shipmentId.trim())}/order_info?originUrl=%2ForderTracking&module=am_hubDeliveryManagement&stationType=AM_HUB`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Xem đơn ${shipmentId} trên SPX (tab mới)`}
      className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded px-1 text-xs font-semibold text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
      Xem trên SPX <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

export function CopyBacklogOrders({ disabled, loadCodes }: {
  disabled: boolean;
  loadCodes: (signal: AbortSignal) => string[] | Promise<string[]>;
}) {
  const active = useRef<AbortController | null>(null);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => () => active.current?.abort(), []);

  async function copyAll() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setCopying(true);
    setNotice("");
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard) throw new Error("Trình duyệt chưa cho phép sao chép mã đơn.");
      const pending = loadCodes(controller.signal);
      let codes: string[];
      if (Array.isArray(pending)) {
        codes = pending;
        await clipboard.writeText(codes.join("\n"));
      } else if (typeof ClipboardItem !== "undefined" && typeof clipboard.write === "function") {
        // Start the clipboard write during the click while the other pages load.
        const text = pending.then((rows) => {
          controller.signal.throwIfAborted();
          return new Blob([rows.join("\n")], { type: "text/plain" });
        });
        [codes] = await Promise.all([pending, text, clipboard.write([new ClipboardItem({ "text/plain": text })])]);
      } else {
        codes = await pending;
        controller.signal.throwIfAborted();
        await clipboard.writeText(codes.join("\n"));
      }
      if (!controller.signal.aborted) setNotice(`Đã sao chép ${codes.length.toLocaleString("vi-VN")} mã đơn.`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setNotice(error instanceof Error && !(error instanceof DOMException)
          ? error.message : "Không sao chép được mã đơn. Hãy kiểm tra quyền clipboard rồi thử lại.");
      }
    } finally {
      controller.abort();
      active.current = null;
      setCopying(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" disabled={disabled || copying} aria-busy={copying}
        className="min-h-9 px-3 text-xs" onClick={() => void copyAll()}>
        <Copy size={15} aria-hidden="true" />{copying ? "Đang sao chép…" : "Sao chép tất cả mã đơn"}
      </Button>
      <span role="status" className="text-xs text-[var(--color-ink-2)]">{notice}</span>
    </div>
  );
}
