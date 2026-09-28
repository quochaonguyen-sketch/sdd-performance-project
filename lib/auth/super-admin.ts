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
