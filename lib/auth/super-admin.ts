export function getSuperAdminEmails() {
  return (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "")
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized !== "" && getSuperAdminEmails().includes(normalized);
}

export function isSuperAdmin(context?: { profile?: { is_super_admin?: boolean } } | null): boolean {
  if (!context) return false;
  return context.profile?.is_super_admin === true;
}
