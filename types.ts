export type Role = "admin" | "leader" | "viewer" | "member";


export type Zone = {
  id: string;
  name: string;
  area: string | null;
  hub: string | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Rider = {
  id: string;
  rider_code: string;
  kv: string | null;
  home_district: string | null;
  cot: string | null;
  full_name: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  point_name: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  avatar_url: string | null;
  zone_id: string | null;
  status: string | null;
  current_shift: string | null;
  phone?: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  zones?: Pick<Zone, "id" | "name" | "area" | "hub"> | null;
};

export type RiderRegistryItem = Omit<Rider, "raw_data"> & {
  phone: string | null;
  raw_data: null;
};

export type RiderRegistryData = {
  riders: RiderRegistryItem[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
  stats: {
    total: number;
    active: number;
    inactive: number;
    on_shift: number;
    unassigned: number;
  };
  options: {
    cots: string[];
    shifts: string[];
    delivery_districts: string[];
  };
  cache: {
    hit: boolean;
    expires_at: string | null;
  };
};

export type DriverPerformanceDaily = {
  performance_id: string;
  report_date: string;
  driver_id: string;
  driver_name: string | null;
  contract_type_name: string | null;
  delivery_assigned: number | null;
  delivery_delivered: number | null;
  pickup_assigned: number | null;
  pickup_picked: number | null;
  delivery_success_rate: number | null;
  pickup_success_rate: number | null;
  fetched_at: string;
};

export type AttendanceLog = {
  id: string;
  rider_id: string | null;
  rider_code: string;
  work_date: string;
  shift: string | null;
  status: string;
  note: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  riders?: Pick<Rider, "id" | "full_name" | "rider_code" | "zone_id"> & {
    zones?: Pick<Zone, "id" | "name"> | null;
  };
};


export type DeliveryVolume = {
  id: string;
  shipment_id: string;
  create_time: string;
  received_time: string;
  zone_id_raw: string | null;
  zone_id_matched: string | null;
  old_ward: string | null;
  ward: string | null;
  district: string | null;
  area: string | null;
  order_type: string | null;
  cot_group: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  message: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
};
