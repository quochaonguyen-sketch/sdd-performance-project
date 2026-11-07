import type { CurrentUserContext } from "../auth/current-user";
import { canViewPage } from "../auth/page-access.ts";
import { canAccessPickupManagement, canManageReturn } from "../auth/permissions.ts";

export function briefingAccess(context: CurrentUserContext) {
  const { role, page_access, permissions } = context.profile;
  const view = (key: Parameters<typeof canViewPage>[2]) => canViewPage(role, page_access, key);
  return { riders: view("riders"), delivery: view("delivery_realtime"), pickup: view("pickup_realtime") && canAccessPickupManagement(role, permissions), team: view("team") };
}

export function canReadLegacyAiContext(context: CurrentUserContext, question: string) {
  const { role, page_access } = context.profile;
  const keys: Parameters<typeof canViewPage>[2][] = ["riders", "delivery_realtime"];
  if (/volume|pickup|delivery|đơn|don/i.test(question)) keys.push("delivery_volume", "pickup_volume");
  return keys.every(key => canViewPage(role, page_access, key));
}

export function analysisAccess(context: CurrentUserContext) {
  const { role, page_access, permissions } = context.profile;
  const view = (key: Parameters<typeof canViewPage>[2]) => canViewPage(role, page_access, key);
  return {
    backlog: view("backlog_history") && canAccessPickupManagement(role, permissions),
    oh: view("onhold") && (role === "admin" || permissions.manage_performance),
    volume: view("delivery_volume") && (role === "admin" || permissions.manage_volume),
    overnight: view("overnight"),
    fc: view("dashboard"),
    returns: view("return") && canManageReturn(role, permissions),
    deliveryRealtime: view("delivery_realtime"),
    pickupRealtime: view("pickup_realtime") && canAccessPickupManagement(role, permissions),
  };
}
