"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Database, Download, CalendarDays, TrendingUp, ListChecks, MapPinned, RefreshCcw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { pickupCsvCell } from "@/lib/pickup/csv";
import styles from "./pickup-management-view.module.css";

type PickupAssignment = {
  id: string;
  assignment_key: string;
  assigned_at: string | null;
  last_synced_at: string | null;
  cot: string | null;
  route_name: string | null;
  mapped_pickup_point_group: string | null;
  pickup_point_id: string | null;
  pup_code: string | null;
  shop_name: string | null;
  shop_address: string | null;
  ward: string | null;
  district: string | null;
  pickup_status: number | null;
  pickup_retry_assign_type: number | null;
  ado: number | null;
  ado_days: number;
};

type RouteSummary = {
  route: string;
  count: number;
  helper: string;
};

const ROW_PAGE_SIZE = 80;

export function PickupManagementView() {
  const requestVersion=useRef(0);
  const pendingRequest=useRef<AbortController|null>(null);
  const [total,setTotal]=useState(0),[filteredTotal,setFilteredTotal]=useState(0);
  const [routeSummaries,setRouteSummaries]=useState<RouteSummary[]>([]);
  const [exporting,setExporting]=useState(false);
  const [adoDays,setAdoDays]=useState(0);
  const [rows, setRows] = useState<PickupAssignment[]>([]);
  const [sortOrder,setSortOrder]=useState("ado_desc");
  const [selectedRoute, setSelectedRoute] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useReportInitialDataLoading("pickup-management", loading);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    const version=++requestVersion.current;
    pendingRequest.current?.abort();
    const controller=new AbortController();
    pendingRequest.current=controller;
    setLoading(true);setError(null);
    try {
      const params=new URLSearchParams({page:String(currentPage),q:deferredQuery,route:selectedRoute,sort:sortOrder});
      const response=await fetch(`/api/pickup-points?${params}`,{cache:"no-store",signal:controller.signal});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error);
      if(version!==requestVersion.current||controller.signal.aborted)return;
      const lastPage=Math.max(1,Math.ceil(body.filtered/ROW_PAGE_SIZE));
      if(currentPage>lastPage){setCurrentPage(lastPage);return;}
      setRows(body.rows);setTotal(body.total);setFilteredTotal(body.filtered);setRouteSummaries(body.routes);setAdoDays(body.ado_days);
    } catch(error) {if(version===requestVersion.current&&!(error instanceof Error&&error.name==="AbortError"))setError(error instanceof Error?error.message:"Không tải được PUP");}
    finally {if(version===requestVersion.current&&!controller.signal.aborted)setLoading(false);}
  }, [currentPage,deferredQuery,selectedRoute,sortOrder]);

  useEffect(() => {
    const timer=setTimeout(()=>void loadAssignments(),250);
    return ()=>{clearTimeout(timer);pendingRequest.current?.abort();};
  }, [loadAssignments]);

  const refresh = useCallback(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useSupabaseRealtime({ table: "pickup_assignments", onChange: refresh });

  const routeOptions = useMemo(
    () =>
      routeSummaries
        .filter((route) => route.route !== "Chưa có tuyến")
        .map((route) => route.route)
        .sort((a, b) => a.localeCompare(b, "vi", { numeric: true })),
    [routeSummaries],
  );

  const activeRoute = routeSummaries.find((route) => route.route === selectedRoute);
  const featuredRoutes = useMemo(() => {
    const topRoutes = routeSummaries.slice(0, 5);
    if (selectedRoute === "all" || topRoutes.some((route) => route.route === selectedRoute)) return topRoutes;
    const selected = routeSummaries.find((route) => route.route === selectedRoute);
    return selected ? [selected, ...topRoutes].slice(0, 5) : topRoutes;
  }, [routeSummaries, selectedRoute]);
  const pageCount = Math.max(1, Math.ceil(filteredTotal / ROW_PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pageStart = (safePage - 1) * ROW_PAGE_SIZE;

  async function changeRoute(row: PickupAssignment, nextRoute: string) {
    const cleanedRoute = nextRoute.trim();
    if (!cleanedRoute || cleanedRoute === routeName(row.route_name)) return;

    const supabase = createClient();
    setUpdatingId(row.id);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase
      .from("pickup_assignments")
      .update({ route_name: cleanedRoute })
      .eq("id", row.id);

    setUpdatingId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    void loadAssignments();
    setSuccess(`Đã chuyển ${pickupCode(row)} sang ${cleanedRoute}.`);
  }

  async function exportForPython() {
    if(exporting)return;
    setExporting(true);
    try {
      const exported:PickupAssignment[]=[];
      const ids=new Set<string>();
      let exportDays:number|undefined;
      let exportTotal:number|undefined;
      for(let page=1;;page++) {
        const params=new URLSearchParams({page:String(page),size:"1000",q:deferredQuery,route:selectedRoute,sort:sortOrder});
        const response=await fetch(`/api/pickup-points?${params}`,{cache:"no-store"});
        const body=await response.json();
        if(!response.ok)throw new Error(body.error);
        exportDays??=body.ado_days;
        exportTotal??=body.filtered;
        if(body.ado_days!==exportDays||body.filtered!==exportTotal)throw new Error("Dữ liệu đã thay đổi trong lúc xuất. Vui lòng thử lại.");
        for(const row of body.rows){
          if(ids.has(row.id))throw new Error("Thứ tự PUP đã thay đổi trong lúc xuất. Vui lòng thử lại.");
          ids.add(row.id);exported.push(row);
        }
        if(exported.length===exportTotal)break;
        if(body.rows.length===0||exported.length>body.filtered)throw new Error("Danh sách xuất chưa đầy đủ. Vui lòng thử lại.");
      }
      const csv = buildPickupAssignmentCsv(exported);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pickup_assignments.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    } catch(error){setError(error instanceof Error?error.message:"Không xuất được CSV");}
    finally{setExporting(false);}
  }

  return (
    <div className={styles.page}>
      <header className={styles.commandHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon}><ListChecks size={20} /></span>
          <div>
            <p className={styles.contextLine}>SDD OPERATIONS / PICKUP</p>
            <h1>Pickup Points<span className={styles.hubBadge}>Toàn hub</span></h1>
            <p className={styles.lede}>Theo dõi shop, tuyến lấy hàng và sản lượng trung bình mỗi ngày.</p>
          </div>
        </div>
        <div className={styles.commandActions}>
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading} className={styles.actionButton}>
            <RefreshCcw size={16} className={loading ? styles.spinning : undefined} />
            Làm mới
          </Button>
          <Button type="button" onClick={()=>void exportForPython()} disabled={loading || exporting || total === 0} className={styles.actionButton}>
            <Download size={16} />
            {exporting?"Đang xuất…":"Xuất CSV"}
          </Button>
        </div>
      </header>

      {error ? <p className={styles.errorBanner}><AlertTriangle size={17} />Không tải hoặc cập nhật được PUP: {error}</p> : null}
      {success ? <p className={styles.successBanner}><CheckCircle2 size={17} />{success}</p> : null}

      <section className={styles.signalStrip} aria-label="Tín hiệu vận hành PUP">
        <MetricCard icon={<Database size={17} />} label="Điểm lấy hàng" value={total} loading={loading} />
        <MetricCard icon={<MapPinned size={17} />} label="Tuyến pickup" value={routeSummaries.length} loading={loading} />
        <MetricCard icon={<Search size={17} />} label="Đang hiển thị" value={filteredTotal} loading={loading} />
        <MetricCard icon={<CalendarDays size={17} />} label="Ngày tính ADO" value={adoDays} loading={loading} />
      </section>

      <section className={styles.routeIndex} aria-labelledby="route-index-title">
        <div className={styles.sectionHeading}>
          <div><h2 id="route-index-title">Tuyến lấy hàng</h2><p>Chọn tuyến để xem các shop phụ trách.</p></div>
          <label className={styles.routeSelectLabel}>
            <span>Tất cả tuyến</span>
            <select value={selectedRoute} onChange={(event) => { setSelectedRoute(event.target.value); setCurrentPage(1); }}>
              <option value="all">Tất cả · {formatNumber(total)} PUP</option>
              {routeSummaries.map((route) => <option key={route.route} value={route.route}>{route.route} · {formatNumber(route.count)}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.routeRail}>
          <RouteTab active={selectedRoute === "all"} label="Tất cả" count={total} helper={`${routeSummaries.length} tuyến`} onClick={() => { setSelectedRoute("all"); setCurrentPage(1); }} />
          {featuredRoutes.map((route) => <RouteTab key={route.route} active={selectedRoute === route.route} label={route.route} count={route.count} helper={route.helper} onClick={() => { setSelectedRoute(route.route); setCurrentPage(1); }} />)}
        </div>
      </section>

      <section className={styles.ledger} aria-labelledby="pup-ledger-title">
        <div className={styles.ledgerToolbar}>
          <div><h2 id="pup-ledger-title">Danh sách điểm lấy hàng</h2><p>{selectedRoute === "all" ? "Toàn bộ dữ liệu" : activeRoute?.route ?? selectedRoute} · {formatNumber(filteredTotal)} kết quả</p></div>
          <div className={styles.ledgerFilters}><label className={styles.routeSelectLabel}><span>Sắp xếp</span><select aria-label="Sắp xếp Pickup Points" value={sortOrder} onChange={event=>{setSortOrder(event.target.value);setCurrentPage(1);}}><option value="ado_desc">ADO: cao → thấp</option><option value="route">Theo tuyến</option></select></label>
          <label className={styles.searchField}>
            <span>Tìm trong danh sách</span>
            <div className={styles.searchShell}><Search size={17} /><Input value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }} placeholder="Tìm tên shop, mã PUP, địa chỉ…" className={styles.searchInput} />{query ? <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => setQuery("")}><X size={15} /></button> : null}</div>
          </label></div>
        </div>

        <div className={styles.adoContext}><TrendingUp size={16} aria-hidden="true"/><strong>ADO làm tròn lên</strong><span>Trung bình {adoDays} ngày đầy đủ trong 30 ngày gần nhất</span><details><summary>Cách tính</summary><p>Tổng đơn của shop chia số ngày đầy đủ, sau đó làm tròn lên số nguyên. Tính cả ngày có 0 đơn và không tính hôm nay.</p></details></div>
        <div className={styles.tableFrame} role="table" aria-label="Danh sách Pickup Points và ADO">
          <div className={styles.tableHead} role="row"><span role="columnheader">Mã PUP</span><span role="columnheader">Shop</span><span role="columnheader">Địa chỉ lấy hàng</span><span role="columnheader">Phường / Quận</span><span role="columnheader">Tuyến hiện tại</span><span role="columnheader" aria-sort={sortOrder==="ado_desc"?"descending":"none"}>ADO / ngày {sortOrder==="ado_desc"?"↓":""}</span></div>
          <div className={styles.tableBody} role="rowgroup" aria-live="polite">
            {loading ? Array.from({ length: 8 }, (_, index) => <div key={index} className={styles.skeletonRow}><i /><i /><i /><i /></div>) : null}
            {!loading && rows.length === 0 ? <div className={styles.emptyState}><Search size={21} /><strong>Không có PUP phù hợp.</strong><span>Đổi từ khóa hoặc chọn lại tuyến để mở rộng kết quả.</span><button type="button" onClick={() => { setQuery(""); setSelectedRoute("all"); }}>Xóa bộ lọc</button></div> : null}
            {!loading ? rows.map((row) => <div key={row.id} className={styles.tableRow} role="row">
              <div className={styles.identityCell} role="cell" data-label="PUP"><strong>{pickupCode(row)}</strong><span>{row.last_synced_at ? "Đồng bộ " : ""}{formatAssignedAt(row.last_synced_at ?? row.assigned_at)}</span></div>
              <p className={styles.shopCell} role="cell" data-label="Shop">{row.shop_name || "—"}</p>
              <p className={styles.addressCell} role="cell" data-label="Địa chỉ" title={row.shop_address || undefined}>{row.shop_address || "—"}</p>
              <div className={styles.locationCell} role="cell" data-label="Phường / Quận"><strong>{row.ward || "—"}</strong><span>{row.district || "—"}</span></div>
              <div className={styles.routeCell} role="cell" data-label="Tuyến hiện tại">{row.last_synced_at ? <div title={row.mapped_pickup_point_group || undefined}><strong>{routeName(row.route_name)}</strong><p className="mt-1 text-xs text-slate-500">{row.route_name?"Theo danh mục SPX":row.mapped_pickup_point_group?"Nhiều nhóm, cần đối chiếu":"Chưa có nhóm SPX"}</p></div> : <RoutePicker row={row} routes={routeOptions} disabled={updatingId === row.id} onChangeRoute={changeRoute} />}</div>
              <div className={styles.adoCell} role="cell" data-label="ADO / ngày"><strong>{row.ado===null?"—":row.ado.toLocaleString("vi-VN")}</strong><span>{row.ado===null?"Chưa có dữ liệu":"đơn / ngày"}</span></div>
            </div>) : null}
          </div>
        </div>

        <footer className={styles.pagination}>
          <span>Hiện {filteredTotal === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + ROW_PAGE_SIZE, filteredTotal)} / {formatNumber(filteredTotal)} PUP</span>
          <div><button type="button" aria-label="Trang trước" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage <= 1}><ChevronLeft size={16} /></button><strong>Trang {safePage}/{pageCount}</strong><button type="button" aria-label="Trang sau" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={safePage >= pageCount}><ChevronRight size={16} /></button></div>
        </footer>
      </section>
    </div>
  );
}

function RoutePicker({
  row,
  routes,
  disabled,
  onChangeRoute,
}: {
  row: PickupAssignment;
  routes: string[];
  disabled: boolean;
  onChangeRoute: (row: PickupAssignment, nextRoute: string) => Promise<void>;
}) {
  const currentRoute = routeName(row.route_name);
  const [open, setOpen] = useState(false);
  const [draftRoute, setDraftRoute] = useState(currentRoute);

  const filteredRoutes = useMemo(() => {
    const normalizedDraft = draftRoute.trim().toLocaleLowerCase("vi");
    return routes
      .filter((route) => route !== currentRoute)
      .filter((route) => !normalizedDraft || route.toLocaleLowerCase("vi").includes(normalizedDraft))
      .slice(0, 7);
  }, [currentRoute, draftRoute, routes]);

  async function saveRoute(nextRoute = draftRoute) {
    const cleanedRoute = nextRoute.trim();
    if (!cleanedRoute) return;
    await onChangeRoute(row, cleanedRoute);
    setDraftRoute(cleanedRoute);
    setOpen(false);
  }

  function cancelEdit() {
    setDraftRoute(currentRoute);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={styles.routePickerButton}
        aria-label={`Chuyển tuyến cho ${pickupCode(row)}`}
        aria-expanded={false}
      >
        <span>{currentRoute}</span>
        <ChevronDown size={15} />
      </button>
    );
  }

  return (
    <div className={styles.routeEditor} data-state={disabled ? "loading" : "default"}>
      <div className={styles.routeEditorControls}>
        <Input
          value={draftRoute}
          onChange={(event) => setDraftRoute(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveRoute();
            if (event.key === "Escape") cancelEdit();
          }}
          autoFocus
          className={styles.routeInput}
          aria-label={`Nhập mã tuyến cho ${pickupCode(row)}`}
        />
        <button
          type="button"
          onClick={() => void saveRoute()}
          disabled={disabled || !draftRoute.trim()}
          className={styles.routeSaveButton}
          aria-label="Lưu tuyến"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className={styles.routeCancelButton}
          aria-label="Hủy đổi tuyến"
        >
          <X size={15} />
        </button>
      </div>
      {filteredRoutes.length > 0 ? (
        <div className={styles.routeOptions}>
          {filteredRoutes.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => void saveRoute(route)}
              className={styles.routeOption}
            >
              {route}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.routeHint}>
          Nhấn Enter để lưu mã tuyến mới.
        </p>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  loading,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <span className={styles.metricIcon}>{icon}</span>
      <div><p>{label}</p><strong>{loading ? "—" : formatNumber(value)}</strong></div>
    </div>
  );
}

function RouteTab({
  active,
  label,
  count,
  helper,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.routeTab} ${active ? styles.routeTabActive : ""}`}
      aria-pressed={active}
      title={label}
    >
      <span className={styles.routeTabLabel}>{label}</span>
      <span className={styles.routeTabMeta}>
        <span>{helper || "Chưa có COT"}</span>
        <strong>{formatNumber(count)}</strong>
      </span>
    </button>
  );
}


function routeName(value: string | null | undefined) {
  return value?.trim() || "Chưa có tuyến";
}

function pickupCode(row: PickupAssignment) {
  return row.pup_code?.trim() || row.pickup_point_id?.trim() || "-";
}

function buildPickupAssignmentCsv(rows: PickupAssignment[]) {
  const headers = [
    "assignment_key",
    "assigned_at",
    "last_synced_at",
    "cot",
    "route_name",
    "mapped_pickup_point_group",
    "pickup_point_id",
    "pup_code",
    "shop_name",
    "shop_address",
    "ward",
    "district",
    "pickup_status",
    "pickup_retry_assign_type",
    "ado_per_day",
    "ado_days",
  ];
  const lines = rows
    .map((row) =>
      [
        row.assignment_key,
        row.assigned_at,
        row.last_synced_at,
        row.cot,
        routeName(row.route_name),
        row.mapped_pickup_point_group,
        row.pickup_point_id,
        row.pup_code,
        row.shop_name,
        row.shop_address,
        row.ward,
        row.district,
        row.pickup_status?.toString(),
        row.pickup_retry_assign_type?.toString(),
        row.ado?.toString(),
        String(row.ado_days),
      ].map(pickupCsvCell).join(","),
    );

  return [headers.join(","), ...lines].join("\r\n");
}

function formatAssignedAt(value: string | null) {
  if (!value) return "—";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return "—";
  return new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
