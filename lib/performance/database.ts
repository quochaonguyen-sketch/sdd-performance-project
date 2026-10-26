import "server-only";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { performanceSessionUrl } from "./database-url";

const state=globalThis as unknown as {performanceReadClient?:PrismaClient;performanceReadReady?:Promise<PrismaClient>};
export function getPerformanceDatabase():Promise<PrismaClient>{
  if(!state.performanceReadReady){
    const url=performanceSessionUrl(process.env.DATABASE_URL,process.env.DIRECT_URL,Boolean(process.env.VERCEL||process.env.AWS_LAMBDA_FUNCTION_NAME));
    if(!url){state.performanceReadReady=Promise.resolve(prisma);}
    else{
      const client=state.performanceReadClient??new PrismaClient({datasources:{db:{url}},log:["error"]});state.performanceReadClient=client;
      state.performanceReadReady=client.$connect().then(()=>client).catch(async()=>{await client.$disconnect().catch(()=>{});return prisma;});
    }
  }
  return state.performanceReadReady;
}
