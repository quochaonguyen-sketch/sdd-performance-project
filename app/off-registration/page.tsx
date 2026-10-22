import type { Metadata } from "next";
import { PublicOffRegistration } from "@/components/off-schedule/public-off-registration";

export const metadata: Metadata = {
  title: "Đăng ký lịch OFF | Rider Operations",
  description: "Trang đăng ký lịch OFF dành cho rider Khu vực 1–5.",
};

export default function OffRegistrationPage() {
  return <PublicOffRegistration />;
}
