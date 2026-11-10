"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, X, Check, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  riderCode: string;
  riderName?: string | null;
  initialFactor?: number;
  initialScope?: "all" | "delivery" | "pickup";
  initialIsActive?: boolean;
  initialNote?: string | null;
  isMasked?: boolean;
  onSuccess: () => void;
};

const PRESET_PERCENTAGES = [20, 30, 50, 70, 80];

export function RiderMaskDialog({
  open,
  onClose,
  riderCode,
  riderName,
  initialFactor = 0.5,
  initialScope = "all",
  initialIsActive = true,
  initialNote = "",
  isMasked = false,
  onSuccess,
}: Props) {
  const [percent, setPercent] = useState<number>(Math.round(initialFactor * 100));
  const [scope, setScope] = useState<"all" | "delivery" | "pickup">(initialScope);
  const [isActive, setIsActive] = useState<boolean>(initialIsActive);
  const [note, setNote] = useState<string>(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPercent(Math.round((initialFactor ?? 0.5) * 100));
      setScope(initialScope ?? "all");
      setIsActive(initialIsActive ?? true);
      setNote(initialNote ?? "");
      setError(null);
    }
  }, [open, initialFactor, initialScope, initialIsActive, initialNote]);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (percent < 0 || percent > 500) {
      setError("Hệ số hiển thị phải từ 0% đến 500%");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/rider-volume-mask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rider_code: riderCode.trim(),
          rider_name: riderName ?? null,
          factor: percent / 100,
          scope,
          is_active: isActive,
          note: note.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Không thể lưu cấu hình");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Bạn có chắc muốn xóa cấu hình mask cho rider ${riderName || riderCode}? Sản lượng sẽ trở về 100% cho mọi người.`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rider-volume-mask?rider_code=${encodeURIComponent(riderCode.trim())}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Không thể xóa cấu hình");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi xóa");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Cấu hình Mask Sản Lượng
              </h2>
              <p className="text-xs text-slate-500">
                Quyền Super Admin · Người khác chỉ thấy tỷ lệ này
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-sm">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Rider Info Card */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rider</span>
              <p className="text-sm font-bold text-slate-900">{riderName || "Chưa có tên"}</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Mã Rider</span>
              <p className="font-mono text-sm font-bold text-amber-700">{riderCode}</p>
            </div>
          </div>

          {/* Factor Setting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Tỷ lệ hiển thị cho người khác
              </label>
              <span className="text-xs font-black text-rose-600">
                {percent}% (Giảm {Math.max(0, 100 - percent)}%)
              </span>
            </div>

            {/* Quick buttons */}
            <div className="flex items-center gap-1.5">
              {PRESET_PERCENTAGES.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPercent(p)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all border ${
                    percent === p
                      ? "border-amber-500 bg-amber-500 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-slate-500 shrink-0">Tùy chỉnh:</span>
              <Input
                type="number"
                min={0}
                max={500}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="h-8 text-sm font-bold"
              />
              <span className="text-xs font-bold text-slate-500">%</span>
            </div>
          </div>

          {/* Scope Setting */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Phạm vi áp dụng</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { key: "all", label: "Tất cả" },
                { key: "delivery", label: "Chỉ Giao" },
                { key: "pickup", label: "Chỉ Lấy" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setScope(opt.key as any)}
                  className={`rounded-lg py-1.5 text-xs font-semibold border transition-all ${
                    scope === opt.key
                      ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Switch */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50/50">
            <div>
              <p className="text-xs font-bold text-slate-900">Kích hoạt ẩn sản lượng</p>
              <p className="text-[11px] text-slate-500">
                {isActive ? "Đang bật (Người khác sẽ chỉ thấy tỷ lệ đã mask)" : "Đang tắt (Người khác thấy 100%)"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                isActive ? "bg-amber-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Note */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Ghi chú nội bộ</label>
            <Input
              type="text"
              placeholder="Lý do điều chỉnh (chỉ Super Admin thấy)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            {isMasked ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="text-xs h-8 px-2.5"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>Xóa Mask</span>
              </Button>
            ) : <span />}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={saving || deleting}
                className="text-xs h-8"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={saving || deleting}
                className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white gap-1.5 font-bold"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Lưu cấu hình</span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
