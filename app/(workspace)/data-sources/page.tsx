import { notFound } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { DATA_SOURCES, canViewSource } from "@/lib/data-sources/catalog";
import { DataSourcesView } from "@/components/data-sources/data-sources-view";

export default async function DataSourcesPage() {
  const context=await getCurrentUserContext();
  if(context&&!DATA_SOURCES.some(s=>canViewSource(context.profile.role,context.profile.permissions,s.id))) notFound();
  return <ProtectedPage><DataSourcesView /></ProtectedPage>;
}
