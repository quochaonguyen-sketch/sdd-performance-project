export type OvernightHoldSnapshot = {
  cutoff_date: string;
  captured_at: string;
  total_orders: number;
  delivering_count: number;
  onhold_count: number;
  rider_count: number;
  resolved_count: number;
  status: string;
  created_at: string;
  updated_at: string;
  supplemented_at?: string | null;
  supplemented_count?: number;
  status_synced_at?: string | null;
  status_sync_requested_at?: string | null;
  status_sync_started_at?: string | null;
  status_sync_token?: string | null;
  status_sync_error?: string | null;
};

export type OvernightHoldOrder = {
  id: string;
  cutoff_date: string;
  order_key: string;
  order_code: string;
  delivering_at?: string | null;
  added_after_cutoff_at?: string | null;
  area: string;
  district: string;
  ward: string;
  rider_code: string;
  rider_name: string;
  cutoff_status: 1 | 5;
  current_status: "Delivering" | "Onhold" | "Delivered" | "Returned" | string;
  reason: string;
  reason_label: string;
  note: string;
  note_updated_at: string | null;
  note_updated_by: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export type OvernightHoldSummary = {
  total: number;
  delivering: number;
  onhold: number;
  resolved: number;
  hasNotes: number;
  riderCount: number;
};

export type OvernightHoldData = {
  riders: OvernightRider[];
  totalRiders: number;
  snapshot: OvernightHoldSnapshot | null;
  snapshots: {
    cutoff_date: string;
    total_orders: number;
    resolved_count: number;
    captured_at: string;
  }[];
  orders: OvernightHoldOrder[];
  total: number;
  page: number;
  pageSize: number;
  summary: OvernightHoldSummary;
};

export type OvernightRider = {
  code: string; name: string; total: number; remaining: number; resolved: number;
  areas: string[]; note: string; noteUpdatedBy: string | null;
};
