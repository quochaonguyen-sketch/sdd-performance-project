import { ProtectedPage } from "@/components/layout/protected-page";
import { RiderPerformanceView } from "@/components/riders/rider-performance-view";
import { readDetailRange } from "@/lib/performance/rider-detail";

export default async function RiderPerformancePage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  const { id } = await params;
  const query=await searchParams;
  let range;
  try{const values=new URLSearchParams();if(typeof query.from==="string")values.set("from",query.from);if(typeof query.to==="string")values.set("to",query.to);range=readDetailRange(values);}catch{range=readDetailRange(new URLSearchParams());}

  return (
    <ProtectedPage>
      <RiderPerformanceView key={id} riderId={id} initialRange={range} fromPerformance={query.origin==="performance"} />
    </ProtectedPage>
  );
}
