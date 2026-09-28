export type AppRole = "admin" | "leader" | "viewer" | "member";

export type PermissionKey =
  | "manage_riders"
  | "manage_return"
  | "manage_volume"
  | "manage_performance"
  | "manage_dashboard"
  | "manage_pickup";

export type MemberPermissions = Record<PermissionKey, boolean>;

export const PERMISSION_OPTIONS: Array<{ key: PermissionKey; label: string; hint: string }> = [
  { key: "manage_dashboard", label: "Dashboard / Realtime", hint: "Xem dashboard vận hành" },
  { key: "manage_riders", label: "Thêm / sửa Rider", hint: "Tạo và chỉnh sửa hồ sơ rider" },
  { key: "manage_return", label: "Return", hint: "Tổng quan hàng trả" },
  { key: "manage_volume", label: "Volume", hint: "Sản lượng delivery / pickup" },
  { key: "manage_performance", label: "Performance", hint: "Xem và xử lý hiệu suất" },
  { key: "manage_pickup", label: "Pickup Realtime", hint: "Theo dõi pickup KV1–KV6" },
];

const EMPTY_PERMISSIONS = Object.fromEntries(PERMISSION_OPTIONS.map((item) => [item.key, false])) as MemberPermissions;
const ALL_PERMISSIONS = Object.fromEntries(PERMISSION_OPTIONS.map((item) => [item.key, true])) as MemberPermissions;

export function defaultPermissionsForRole(role: string | null | undefined): MemberPermissions {
  if (role === "admin" || role === "leader") return { ...ALL_PERMISSIONS };
  return { ...EMPTY_PERMISSIONS };
}

export function normalizePermissions(value: unknown, role?: string | null): MemberPermissions {
  const fallback = defaultPermissionsForRole(role);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const next = { ...fallback };
  for (const item of PERMISSION_OPTIONS) {
    if (typeof raw[item.key] === "boolean") next[item.key] = raw[item.key] as boolean;
  }
  return next;
}

export function selectedPermissionKeys(permissions: MemberPermissions) {
  return PERMISSION_OPTIONS.filter((item) => permissions[item.key]).map((item) => item.key);
}

export function canManageRiders(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.manage_riders);
}

export function canManageReturn(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.manage_return);
}

export function canAccessPickupManagement(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.manage_pickup);
}
