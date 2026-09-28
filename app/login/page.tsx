import { LoginForm } from "@/components/layout/login-form";

const messages: Record<string, string> = {
  domain: "Chỉ tài khoản @spxexpress.com mới được phép truy cập.",
  not_allowed: "Email này chưa được thêm vào danh sách thành viên. Liên hệ admin để được cấp quyền.",
  oauth: "Không thể hoàn tất đăng nhập Google. Vui lòng thử lại.",
  oauth_code: "Google không trả về mã đăng nhập. Kiểm tra Redirect URL trong Supabase.",
  oauth_exchange: "Đổi phiên Google thất bại. Bật Google provider và thêm Redirect URL: /auth/callback",
  profile: "Đăng nhập Google thành công nhưng không lưu được hồ sơ thành viên.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginForm initialError={error ? messages[error] ?? messages.oauth : undefined} />;
}
