"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deliveryDistrictLabel, type CotFilter, type DistrictAgg } from "./lmhub-inventory-model";
import { buildDeliveryReport, reportHeat, type ReportRow } from "./delivery-backlog-report-model";

const number = (value: number) => value.toLocaleString("vi-VN");
const areaLabel = (area: string) => area.replace(/^KV/, "Khu vực ");
const columns = ["Khu vực", "Quận / huyện", "COT 1", "COT 2", "Tổng tồn", "Cơ cấu COT"];
const widths = [150, 270, 100, 100, 110, 180];

export function drawDeliveryReport(canvas: HTMLCanvasElement, rows: ReportRow[], updated: string, scope: string) {
  const width = 958, rowHeight = 34;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ tạo ảnh báo cáo.");
  ctx.font = "13px Arial";
  const scopeLines: string[] = [];
  let line = "";
  for (const word of `Phạm vi: ${scope}`.split(" ")) {
    if (line && ctx.measureText(`${line} ${word}`).width > width - 48) {
      scopeLines.push(line); line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  scopeLines.push(line);
  const top = Math.max(170, 154 + scopeLines.length * 18);
  const height = top + (rows.length + 1) * rowHeight + 54;
  canvas.width = width * 2;
  canvas.height = height * 2;
  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1e354f";
  ctx.fillRect(0, 0, width, 88);
  ctx.fillStyle = "#bdd8ed";
  ctx.font = "bold 11px Arial";
  ctx.fillText("SDD OPERATIONS / DELIVERY BACKLOG", 24, 26);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Arial";
  ctx.fillText("BÁO CÁO TỒN DELIVERY", 24, 62);
  ctx.fillStyle = "#334155";
  ctx.font = "13px Arial";
  ctx.fillText(`Cập nhật dữ liệu: ${updated}`, 24, 113);
  scopeLines.forEach((text, index) => ctx.fillText(text, 24, 136 + index * 18));
  const max = Math.max(1, ...rows.filter((r) => r.kind === "district").map((r) => r.total));
  const chartMax = Math.max(1, ...rows.filter((r) => r.kind === "subtotal").map((r) => r.total));
  const cell = (text: string, x: number, y: number, w: number, bg: string, bold: boolean, center = false) => {
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, rowHeight);
    ctx.strokeStyle = "#d5e1e7"; ctx.lineWidth = 0.5; ctx.strokeRect(x, y, w, rowHeight);
    ctx.fillStyle = bg === "#064750" ? "#ffffff" : "#17324d";
    ctx.font = `${bold ? "bold " : ""}13px Arial`;
    ctx.textAlign = center ? "center" : "left";
    ctx.fillText(text, center ? x + w / 2 : x + 10, y + 22, w - 16);
    ctx.textAlign = "left";
  };
  let x = 24;
  columns.forEach((title, i) => { cell(title, x, top, widths[i], "#064750", true, i > 1); x += widths[i]; });
  rows.forEach((row, index) => {
    const y = top + (index + 1) * rowHeight;
    const bold = row.kind !== "district";
    const bg = row.kind === "total" ? "#c8dce6" : bold ? "#e0f1f3" : index % 2 ? "#f8fafc" : "#ffffff";
    const texts = [areaLabel(row.area), row.kind === "district" ? deliveryDistrictLabel(row.district) : row.district, number(row.cot1), number(row.cot2), number(row.total), ""];
    x = 24;
    texts.forEach((text, i) => {
      cell(text, x, y, widths[i], i >= 2 && i <= 4 ? reportHeat([row.cot1, row.cot2, row.total][i - 2], max) : bg, bold, i >= 2);
      if (i === 5 && row.kind === "subtotal" && row.total) {
        const w = (widths[i] - 20) * row.total / chartMax;
        ctx.fillStyle = "#1e5262"; ctx.fillRect(x + 10, y + 10, w * row.cot1 / row.total, 14);
        ctx.fillStyle = "#45a5d9"; ctx.fillRect(x + 10 + w * row.cot1 / row.total, y + 10, w * row.cot2 / row.total, 14);
      }
      x += widths[i];
    });
  });
  ctx.fillStyle = "#526477"; ctx.font = "12px Arial";
  ctx.fillText("Cơ cấu khu vực: COT 1 (xanh đậm) · COT 2 (xanh sáng) | Màu ô: ít tồn → nhiều tồn", 24, height - 22);
}

export function DeliveryBacklogReport({ districts, cot, snapshotAt, scope, disabled }: {
  districts: DistrictAgg[]; cot: CotFilter; snapshotAt: string | null; scope: string; disabled: boolean;
}) {
  const rows = useMemo(() => buildDeliveryReport(districts, cot), [districts, cot]);
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const updated = snapshotAt ? new Date(snapshotAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }) : "Chưa có dữ liệu";
  const max = Math.max(1, ...rows.filter((r) => r.kind === "district").map((r) => r.total));
  const chartMax = Math.max(1, ...rows.filter((r) => r.kind === "subtotal").map((r) => r.total));
  async function download() {
    setExporting(true); setError(null);
    try {
      const canvas = document.createElement("canvas");
      drawDeliveryReport(canvas, rows, updated, scope);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Không tạo được ảnh báo cáo.")), "image/png"));
      const url = URL.createObjectURL(blob);
      const link = linkRef.current!;
      link.href = url;
      link.download = `delivery-backlog-${snapshotAt ? new Date(snapshotAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }) : "report"}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Tải ảnh thất bại. Vui lòng thử lại."); }
    finally { setExporting(false); }
  }
  return <section className="delivery-report rounded-xl border border-slate-200 bg-white" aria-label="Ảnh báo cáo tồn Delivery">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3"><Camera size={20} className="text-slate-600" /><div><h2 className="font-semibold text-slate-800">Ảnh báo cáo tồn Delivery</h2><p className="mt-1 text-xs text-slate-500">Theo khu vực / quận · COT 1, COT 2 và tổng tồn · Dùng bộ lọc hiện tại</p></div></div>
      <div className="flex items-center gap-2"><Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="delivery-report-preview">{open ? "Thu gọn" : "Xem báo cáo"}</Button><Button onClick={download} disabled={disabled || !snapshotAt || !districts.length || exporting}><Download size={16} />{exporting ? "Đang tạo ảnh…" : "Tải ảnh PNG"}</Button></div>
    </div>
    <a ref={linkRef} hidden />
    {error && <p role="alert" className="px-4 pb-3 text-sm text-red-700">{error}</p>}
    {open && <div id="delivery-report-preview" className="border-t border-slate-200 bg-slate-50 p-3 sm:p-5">
      <div className="mx-auto max-w-[1000px] overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="min-w-[740px]">
          <div className="bg-[#1e354f] px-5 py-4 text-white"><p className="text-[11px] font-semibold tracking-widest text-sky-200">SDD OPERATIONS / DELIVERY BACKLOG</p><h3 className="mt-1 text-xl font-bold">BÁO CÁO TỒN DELIVERY</h3></div>
          <div className="space-y-1 px-4 py-3 text-xs text-slate-600"><p>Cập nhật dữ liệu: {updated} (giờ Việt Nam)</p><p>Phạm vi: {scope}</p></div>
          <table className="w-full border-collapse text-xs tabular-nums"><caption className="sr-only">Tồn Delivery theo khu vực và quận huyện, theo bộ lọc hiện tại</caption><thead><tr className="bg-[#064750] text-white">{columns.map((c) => <th key={c} scope="col" className="border border-white/20 px-3 py-3 text-left">{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.area}-${r.district}-${r.kind}`} className={r.kind === "total" ? "bg-[#c8dce6] font-bold" : r.kind === "subtotal" ? "bg-[#e0f1f3] font-bold" : i % 2 ? "bg-slate-50" : "bg-white"}>
            <th scope="row" className="border border-slate-200 px-3 py-2 text-left" style={{ fontWeight: "inherit" }}>{areaLabel(r.area)}{r.kind === "subtotal" ? " · Tổng" : ""}</th><td className="border border-slate-200 px-3 py-2">{r.kind === "district" ? deliveryDistrictLabel(r.district) : r.district}</td>
            {[r.cot1, r.cot2, r.total].map((value, col) => <td key={col} className="border border-slate-200 px-3 py-2 text-center text-slate-900" style={{ background: reportHeat(value, max) }}>{number(value)}</td>)}
            <td className="w-40 border border-slate-200 px-3 py-2">{r.kind === "subtotal" && r.total > 0 && <div className="flex h-3.5" style={{ width: `${r.total / chartMax * 100}%` }} aria-label={`COT 1: ${r.cot1}, COT 2: ${r.cot2}`}><span className="bg-[#1e5262]" style={{ width: `${r.cot1 / r.total * 100}%` }} /><span className="bg-[#45a5d9]" style={{ width: `${r.cot2 / r.total * 100}%` }} /></div>}</td>
          </tr>)}</tbody></table>
          {!districts.length && <p className="p-4 text-sm text-slate-500">Không có đơn trong phạm vi đang chọn.</p>}
          <p className="p-3 text-[11px] text-slate-600">Cơ cấu khu vực: COT 1 (xanh đậm) · COT 2 (xanh sáng). Màu ô: ít tồn → nhiều tồn.</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Ảnh PNG tải xuống chứa toàn bộ bảng, kể cả những dòng ngoài khung đang xem.</p>
    </div>}
  </section>;
}
