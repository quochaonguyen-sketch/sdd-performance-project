"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  Search,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Percent,
  Sparkles,
  Info,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { RiderVolumeMask, VolumeMaskScope } from "@/lib/rider-volume-mask/service";

type SearchRiderItem = {
  rider_code: string;
  full_name: string | null;
  kv: string | null;
  cot: string | null;
  status: string | null;
};

export function RiderVolumeMaskView({ currentUserEmail }: { currentUserEmail: string }) {
  const [masks, setMasks] = useState<RiderVolumeMask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [riderCode, setRiderCode] = useState("");
  const [riderName, setRiderName] = useState("");
  const [percent, setPercent] = useState<number>(50);
  const [scope, setScope] = useState<VolumeMaskScope>("all");
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");

  // Rider search autocomplete
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchRiderItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Table filter
  const [tableFilter, setTableFilter] = useState("");

  const loadMasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rider-volume-mask", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tải danh sách điều chỉnh");
      }
      setMasks(data.masks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMasks();
  }, [loadMasks]);

  // Debounced rider search for autocomplete
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/rider-volume-mask?search=${encodeURIComponent(searchQuery.trim())}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.riders)) {
          setSearchResults(data.riders);
          setShowDropdown(data.riders.length > 0);
        }
      } catch {
        // ignore search error
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectRider = (r: SearchRiderItem) => {
    setRiderCode(r.rider_code);
    setRiderName(r.full_name || r.rider_code);
    setSearchQuery("");
    setShowDropdown(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setRiderCode("");
    setRiderName("");
    setPercent(50);
    setScope("all");
    setIsActive(true);
    setNote("");
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleEdit = (mask: RiderVolumeMask) => {
    setEditingId(mask.id);
    setRiderCode(mask.rider_code);
    setRiderName(mask.rider_name || "");
    setPercent(Math.round(mask.factor * 100));
    setScope(mask.scope);
    setIsActive(mask.is_active);
    setNote(mask.note || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderCode.trim()) {
      setError("Vui lòng chọn hoặc nhập mã rider.");
      return;
    }
    if (percent < 0 || percent > 500) {
      setError("Tỷ lệ % hiển thị phải từ 0% đến 500%.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/rider-volume-mask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          rider_code: riderCode.trim(),
          rider_name: riderName.trim() || undefined,
          factor: percent / 100,
          scope,
          is_active: isActive,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể lưu cấu hình");
      }

      setSuccess(
        editingId
          ? `Đã cập nhật cấu hình cho rider ${riderCode} thành công.`
          : `Đã thêm điều chỉnh cho rider ${riderCode} (hiển thị ${percent}%).`
      );
      resetForm();
      void loadMasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (mask: RiderVolumeMask) => {
    try {
      const nextActive = !mask.is_active;
      const res = await fetch("/api/admin/rider-volume-mask", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mask.id, is_active: nextActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      setMasks((prev) =>
        prev.map((m) => (m.id === mask.id ? { ...m, is_active: nextActive } : m))
      );
      setSuccess(`Đã ${nextActive ? "kích hoạt" : "tạm dừng"} điều chỉnh rider ${mask.rider_code}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi cập nhật trạng thái");
    }
  };

  const handleDelete = async (mask: RiderVolumeMask) => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn xóa cấu hình điều chỉnh của rider ${mask.rider_name || mask.rider_code}? Rider này sẽ hiển thị lại 100% sản lượng thực tế.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/rider-volume-mask?id=${mask.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      setMasks((prev) => prev.filter((m) => m.id !== mask.id));
      setSuccess(`Đã xóa cấu hình điều chỉnh của rider ${mask.rider_code}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi xóa cấu hình");
    }
  };

  const filteredMasks = useMemo(() => {
    if (!tableFilter.trim()) return masks;
    const q = tableFilter.trim().toLowerCase();
    return masks.filter(
      (m) =>
        m.rider_code.toLowerCase().includes(q) ||
        (m.rider_name && m.rider_name.toLowerCase().includes(q)) ||
        (m.note && m.note.toLowerCase().includes(q))
    );
  }, [masks, tableFilter]);

  const activeCount = useMemo(() => masks.filter((m) => m.is_active).length, [masks]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Super Admin Private Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="rounded-xl bg-amber-500/20 p-2.5 text-amber-700 dark:text-amber-300">
              <ShieldAlert size={26} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Điều chỉnh hiển thị sản lượng Rider
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <Lock size={11} aria-hidden="true" />
                  Super Admin Only
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Trang bảo mật riêng biệt (<strong>không hiển thị trên Sidebar</strong>). Dùng để điều chỉnh tỷ lệ % sản lượng mà User và Admin thông thường nhìn thấy trên hệ thống.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Đăng nhập bởi:</span>
            <strong className="font-mono text-slate-700 dark:text-slate-200">{currentUserEmail}</strong>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <XCircle size={18} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Configuration Form Card */}
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              <Sparkles size={18} className="text-blue-600" />
              <span>{editingId ? "Cập nhật cấu hình điều chỉnh" : "Thêm rider cần điều chỉnh sản lượng"}</span>
            </div>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm} className="text-xs">
                Hủy chế độ sửa
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Step 1: Select Rider */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                1. Chọn hoặc nhập mã Rider <span className="text-rose-500">*</span>
              </label>

              {riderCode ? (
                <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 dark:border-blue-900 dark:bg-blue-950/40">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 dark:text-white">{riderName || "Rider"}</strong>
                      <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {riderCode}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">Đã chọn rider này để điều chỉnh sản lượng</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRiderCode("");
                      setRiderName("");
                    }}
                    className="h-8 text-xs text-slate-500 hover:text-rose-600"
                  >
                    Chọn lại
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                    <Input
                      placeholder="Tìm theo tên hoặc mã rider (VD: 149603, Dũng...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                    {searching && (
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400">Đang tìm...</span>
                    )}
                  </div>

                  {/* Autocomplete Dropdown */}
                  {showDropdown && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {searchResults.map((r) => (
                        <button
                          key={r.rider_code}
                          type="button"
                          onClick={() => handleSelectRider(r)}
                          className="flex w-full items-center justify-between rounded-lg p-2 text-left text-xs hover:bg-blue-50 dark:hover:bg-slate-800"
                        >
                          <div>
                            <strong className="text-slate-800 dark:text-slate-100">{r.full_name}</strong>
                            <div className="flex items-center gap-2 text-slate-500">
                              <span className="font-mono">{r.rider_code}</span>
                              {r.kv && <span>· {r.kv}</span>}
                              {r.cot && <span>· {r.cot}</span>}
                            </div>
                          </div>
                          <Badge tone="blue">Chọn</Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Hoặc nhập trực tiếp mã rider:</span>
                    <Input
                      placeholder="Mã rider..."
                      value={riderCode}
                      onChange={(e) => setRiderCode(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Percentage Factor */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2. Tỷ lệ hiển thị (%) <span className="text-rose-500">*</span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {[25, 50, 70, 80, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPercent(preset)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      percent === preset
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {preset}% {preset === 50 ? "(Khuyên dùng)" : ""}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    className="font-bold text-blue-700 dark:text-blue-400"
                  />
                  <Percent size={15} className="absolute right-3 top-3 text-slate-400" />
                </div>
                <span className="text-xs text-slate-500">
                  (Hệ số: <strong>{(percent / 100).toFixed(2)}x</strong>)
                </span>
              </div>

              {/* Live Preview Explanation */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <Info size={13} className="text-blue-500" />
                  <span>Minh họa kết quả hiển thị:</span>
                </div>
                <p className="mt-1">
                  Nếu rider làm thực tế <strong>100 đơn</strong>, người dùng & Admin khác sẽ thấy:{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {Math.round(100 * (percent / 100))} đơn
                  </strong>{" "}
                  ({percent < 100 ? `giảm ${100 - percent}%` : `bằng ${percent}%`}).
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Step 3: Scope */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                3. Phạm vi áp dụng
              </label>
              <Select value={scope} onChange={(e) => setScope(e.target.value as VolumeMaskScope)}>
                <option value="all">Tất cả sản lượng (Cả Giao hàng & Lấy hàng)</option>
                <option value="delivery">Chỉ Giao hàng (Delivery Realtime & Performance)</option>
                <option value="pickup">Chỉ Lấy hàng (Pickup Realtime & Performance)</option>
              </Select>
            </div>

            {/* Step 4: Note & Active Status */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                4. Ghi chú nội bộ & Trạng thái
              </label>
              <div className="flex gap-3">
                <Input
                  placeholder="Lý do điều chỉnh (VD: Thử nghiệm ca 2, hỗ trợ chỉ tiêu...)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="flex-1 text-xs"
                />
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Áp dụng ngay</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm}>
                Hủy bỏ
              </Button>
            )}
            <Button type="submit" disabled={saving} className="min-w-32 bg-blue-600 hover:bg-blue-700">
              {saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Thêm cấu hình"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Configured Masks Table Card */}
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Danh sách Rider đang được cấu hình
                </h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {masks.length} rider
                </span>
                {activeCount > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {activeCount} đang bật
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Các rider trong danh sách này sẽ hiển thị theo tỷ lệ đã đặt khi người khác xem.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  placeholder="Lọc danh sách..."
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  className="h-8 pl-8 text-xs w-48 sm:w-60"
                />
              </div>
              <Button variant="outline" size="sm" onClick={loadMasks} title="Tải lại">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-semibold">Rider</th>
                <th className="px-6 py-3 font-semibold">Tỷ lệ hiển thị</th>
                <th className="px-6 py-3 font-semibold">Phạm vi</th>
                <th className="px-6 py-3 font-semibold">Trạng thái</th>
                <th className="px-6 py-3 font-semibold">Ghi chú</th>
                <th className="px-6 py-3 font-semibold">Cập nhật bởi</th>
                <th className="px-6 py-3 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMasks.map((mask) => {
                const percentVal = Math.round(mask.factor * 100);
                return (
                  <tr
                    key={mask.id}
                    className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                      !mask.is_active ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-6 py-4">
                      <strong className="block font-medium text-slate-900 dark:text-slate-100">
                        {mask.rider_name || "Chưa có tên"}
                      </strong>
                      <span className="font-mono text-xs text-slate-400">{mask.rider_code}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
                          percentVal <= 50
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                        }`}
                      >
                        {percentVal}%{" "}
                        <span className="text-[10px] font-normal opacity-80">({mask.factor.toFixed(2)}x)</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {mask.scope === "all"
                          ? "Giao & Lấy"
                          : mask.scope === "delivery"
                          ? "Chỉ Giao"
                          : "Chỉ Lấy"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleToggle(mask)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          mask.is_active
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                        title="Bấm để bật/tắt áp dụng"
                      >
                        {mask.is_active ? (
                          <>
                            <Eye size={12} /> Đang áp dụng
                          </>
                        ) : (
                          <>
                            <EyeOff size={12} /> Đang tắt
                          </>
                        )}
                      </button>
                    </td>
                    <td className="max-w-44 px-6 py-4 truncate text-slate-500 dark:text-slate-400">
                      {mask.note || "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      <span className="block truncate max-w-36 text-xs">{mask.created_by || "Super Admin"}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(mask.updated_at).toLocaleDateString("vi-VN")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(mask)}
                        className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600"
                        title="Chỉnh sửa"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(mask)}
                        className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600"
                        title="Xóa cấu hình"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!filteredMasks.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {loading
                      ? "Đang tải cấu hình..."
                      : masks.length === 0
                      ? "Chưa có rider nào được điều chỉnh sản lượng. Sử dụng form phía trên để thêm."
                      : "Không có rider nào khớp với từ khóa tìm kiếm."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
