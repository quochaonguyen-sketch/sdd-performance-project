export const scheduleStatuses = [
  "ON", "OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED", "WORKING_REST_DAY", "NO_PICKUP", "NO_DELIVERY",
  "OFF_HOLIDAY", "SUPPORT", "APP_LOCKED",
] as const;

export type RiderScheduleStatus = typeof scheduleStatuses[number];
