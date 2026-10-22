"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppBrand, AppCopyright } from "@/components/layout/app-brand";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "spxexpress.com" },
      },
    });
    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
    }
  }

  return (
    <main className="ops-login">
      <section className="ops-login-story" aria-label="Rider Operations">
        <AppBrand />
        <div className="ops-login-intro">
          <p className="ops-login-eyebrow">Không gian vận hành SDD</p>
          <h2>Mỗi tuyến đường.<br />Một nhịp vận hành.</h2>
          <p>Delivery, pickup và hàng trả trong cùng một không gian làm việc cho đội ngũ Khu vực 1–5.</p>
          <div className="ops-route-diagram" aria-hidden="true">
            <div><span>Bắt đầu</span><strong>Điều phối</strong><i /></div>
            <div><span>Trong ca</span><strong>Theo dõi</strong><i /></div>
            <div><span>Kết ca</span><strong>Hoàn tất</strong><i /></div>
          </div>
        </div>
        <AppCopyright />
      </section>
      <section className="ops-login-access">
        <div className="ops-login-form">
          <p className="ops-login-eyebrow">Dành cho thành viên</p>
          <h1>Vào ca làm việc</h1>
          <p className="ops-login-description">Đăng nhập bằng tài khoản Google công ty đã được quản trị viên cấp quyền.</p>
          {error ? <p role="alert" className="ops-login-error">{error}</p> : null}
          <Button type="button" className="w-full" disabled={loading} onClick={() => void signInWithGoogle()}>
            <GoogleIcon />{loading ? "Đang chuyển đến Google..." : "Đăng nhập với Google"}
          </Button>
          <p className="ops-login-domain">Tài khoản <strong>@spxexpress.com</strong></p>
          <div className="ops-login-help"><strong>Chưa có quyền truy cập?</strong><p>Liên hệ quản trị viên để thêm email của bạn vào danh sách thành viên.</p></div>
        </div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d="M21.35 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.14c1.84-1.7 2.91-4.2 2.91-7.29Z" /><path d="M12 21.75c2.63 0 4.83-.87 6.44-2.35l-3.14-2.52c-.87.58-1.99.92-3.3.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.6A9.74 9.74 0 0 0 12 21.75Z" /><path d="M6.54 13.77A5.86 5.86 0 0 1 6.24 12c0-.61.11-1.2.3-1.77v-2.6H3.3A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.06 1.05 4.37l3.24-2.6Z" /><path d="M12 6.2c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.82 3.3 14.63 2.25 12 2.25A9.74 9.74 0 0 0 3.3 7.63l3.24 2.6C7.31 7.92 9.46 6.2 12 6.2Z" /></svg>;
}
