import { ProtectedPage } from "@/components/layout/protected-page";
import { DriverPerformanceView } from "@/components/performance/driver-performance-view";
import { parsePerformanceFilters } from "@/lib/performance/filters";

export default async function PerformancePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <ProtectedPage><PerformanceContent searchParams={searchParams}/></ProtectedPage>;
}
async function PerformanceContent({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams,filters=parsePerformanceFilters(params);
  const loadedKey=JSON.stringify([filters,Array.isArray(params._r)?params._r[0]:params._r??""]);
  // Render controls and placeholders immediately; data loads independently via the authenticated API.
  return <DriverPerformanceView result={null} filters={filters} error={null} loadedKey={loadedKey}/>;
}
