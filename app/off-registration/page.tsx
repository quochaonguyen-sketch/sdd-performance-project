import { OffRegistrationForm } from "@/components/off-registration/off-registration-form";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { shiftCalendarDay } from "@/lib/performance/calendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký lịch OFF | SDD Operations", robots: { index: false, follow: false } };

export default function OffRegistrationPage() {
  const today = vietnamDay();
  return <OffRegistrationForm today={today} lastDay={shiftCalendarDay(today, 90)} />;
}
