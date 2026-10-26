/** Reuse only the configured session pool for the exact same database and role. */
export function performanceSessionUrl(pooled:string|undefined,session:string|undefined,serverless=false){
  if(serverless||!pooled||!session)return undefined;
  try{
    const a=new URL(pooled),b=new URL(session);
    if(a.hostname!==b.hostname||!a.hostname.endsWith(".pooler.supabase.com")||a.port!=="6543"||b.port!=="5432"||a.username!==b.username||a.password!==b.password||a.pathname!==b.pathname)return undefined;
    b.searchParams.delete("pgbouncer");b.searchParams.set("connection_limit","3");b.searchParams.set("connect_timeout","5");b.searchParams.set("pool_timeout","10");
    return b.toString();
  }catch{return undefined;}
}
