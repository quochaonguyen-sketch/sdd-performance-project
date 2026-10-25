export const OH_AREAS = ["Khu vực 1","Khu vực 2","Khu vực 3","Khu vực 4","Khu vực 5","Chưa rõ KV"] as const;
export const OH_COLORS = ["#2563eb","#059669","#7c3aed","#b45309","#db2777","#64748b"];
export const OH_REASONS:Record<string,string> = {
  "169":"Recipient unavailable for parcel",
  "170":"Recipient reschedule",
  "172":"Recipient reject",
  "13":"Buyer Never Place",
  "185":"Insufficient time",
  "187":"Severe weather",
  "180":"Parcel lost",
  "182":"Unable to Deliver",
  "184":"Wrongly assigned"
};
export const OH_REASONS_VI:Record<string,string> = {
  "169":"Khách hẹn lại / không liên lạc được",
  "170":"Khách đổi ngày nhận hàng",
  "172":"Khách từ chối nhận",
  "13":"Người mua không đặt hàng",
  "185":"Không đủ thời gian giao",
  "187":"Thời tiết xấu",
  "180":"Thất lạc kiện hàng",
  "182":"Không thể giao hàng",
  "184":"Gán nhầm tuyến/đơn"
};
export function reasonName(code:string) { return OH_REASONS[code] ?? (code==="unknown"?"Unknown reason":`Unknown (${code})`); }
export function reasonNameVi(code:string) { return OH_REASONS_VI[code] ?? reasonName(code); }

export type OHCell={
  report_date:string;
  area:string;
  reason:string;
  hour:number;
  status:1|5;
  orders:number;
  district?:string;
  ward?:string;
  rider_code?:string;
  rider_name?:string;
  reason_label?:string;
};

export type OHOrder = {
  order_code: string;
  area: string;
  district: string;
  ward: string;
  reason: string;
  reason_label: string;
  status: 1 | 5;
  hour: number;
  rider_code: string;
  rider_name: string;
  created_at?: string;
};

export type OHOrdersResult = {
  has_snapshot: boolean;
  total: number;
  orders: OHOrder[];
  limit?: number;
  offset?: number;
};

export type OHReport={
  report_date:string;
  fetched_at:string;
  input_count:number;
  excluded_count:number;
  total_orders:number;
  collection_mode?:"snapshot"|"cumulative";
  collection_started_at?:string;
  finalized_at?:string|null;
  scan_count?:number;
  last_input_count?:number;
  last_new_count?:number;
};

export type OHData={reports:OHReport[];cells:OHCell[]};

export function ohRange(from:string,to:string,today:string) {
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!valid(from)||!valid(to)||from>to||to>today||(Date.parse(to)-Date.parse(from))/86400000>92) throw new Error("Chọn khoảng ngày hợp lệ, tối đa 93 ngày, không ở tương lai.");
  return {from,to};
}

export function ohSummary(cells:OHCell[]) {
  const total=cells.reduce((n,c)=>n+c.orders,0),held=cells.filter(c=>c.status===5).reduce((n,c)=>n+c.orders,0);
  return {total,held,received:total-held,unknown:cells.filter(c=>c.area==="Chưa rõ KV").reduce((n,c)=>n+c.orders,0)};
}

export type OHRank = {
  key: string;
  name: string;
  detail: string;
  orders: number;
  area?: string;
  district?: string;
  ward?: string;
  areas?: string[];
  districts?: string[];
  wards?: string[];
};

export function ohRankings(cells: OHCell[], kind: "district" | "ward" | "rider"): OHRank[] {
  type GroupRank = OHRank & {
    _areas: Map<string, number>;
    _districts: Map<string, number>;
    _wards: Map<string, number>;
  };
  const groups = new Map<string, GroupRank>();
  const names = new Map<string, Set<string>>();
  const normalizeName = (name: string) =>
    name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("vi");

  for (const c of cells) {
    if (c.rider_name && c.rider_code && !["unknown", "0"].includes(c.rider_code)) {
      const name = normalizeName(c.rider_name),
        codes = names.get(name) || new Set<string>();
      codes.add(c.rider_code);
      names.set(name, codes);
    }
  }

  for (const c of cells) {
    const district = c.district || "Chưa rõ quận",
      ward = c.ward || "Chưa rõ phường";
    const aliases = names.get(normalizeName(c.rider_name || ""));
    const code =
      c.rider_code && !["unknown", "0"].includes(c.rider_code)
        ? c.rider_code
        : aliases?.size === 1
        ? [...aliases][0]
        : "";
    const name =
      kind === "rider"
        ? c.rider_name || "Chưa rõ rider"
        : kind === "district"
        ? district
        : ward;
    const key =
      kind === "rider"
        ? JSON.stringify([code || normalizeName(name)])
        : JSON.stringify(kind === "district" ? [district] : [district, ward]);

    let rank = groups.get(key);
    if (!rank) {
      rank = {
        key,
        name,
        detail:
          kind === "rider"
            ? code || "Chưa có mã rider"
            : kind === "ward"
            ? district
            : c.area || "",
        orders: 0,
        area: c.area,
        district: kind === "rider" ? district : kind === "ward" ? district : undefined,
        ward: kind === "rider" ? ward : kind === "ward" ? ward : undefined,
        _areas: new Map<string, number>(),
        _districts: new Map<string, number>(),
        _wards: new Map<string, number>(),
      };
      groups.set(key, rank);
    }

    rank.orders += c.orders;

    if (c.area) {
      rank._areas.set(c.area, (rank._areas.get(c.area) || 0) + c.orders);
    }
    if (c.district && c.district !== "Chưa rõ quận") {
      rank._districts.set(c.district, (rank._districts.get(c.district) || 0) + c.orders);
    }
    if (c.ward && c.ward !== "Chưa rõ phường") {
      rank._wards.set(c.ward, (rank._wards.get(c.ward) || 0) + c.orders);
    }
  }

  const results: OHRank[] = [];
  for (const rank of groups.values()) {
    if (kind === "rider") {
      const sortedAreas = [...rank._areas.entries()].sort((a, b) => b[1] - a[1]);
      if (sortedAreas.length) {
        rank.area = sortedAreas[0][0];
        rank.areas = sortedAreas.map(([a]) => a);
      }

      const sortedDistricts = [...rank._districts.entries()].sort((a, b) => b[1] - a[1]);
      if (sortedDistricts.length) {
        rank.district = sortedDistricts[0][0];
        rank.districts = sortedDistricts.map(([d]) => d);
      }

      const sortedWards = [...rank._wards.entries()].sort((a, b) => b[1] - a[1]);
      if (sortedWards.length) {
        rank.ward = sortedWards[0][0];
        rank.wards = sortedWards.map(([w]) => w);
      }
    } else if (kind === "ward") {
      const sortedAreas = [...rank._areas.entries()].sort((a, b) => b[1] - a[1]);
      if (sortedAreas.length) rank.area = sortedAreas[0][0];
    }

    const { _areas, _districts, _wards, ...cleanRank } = rank;
    results.push(cleanRank);
  }

  return results.sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, "vi"));
}
