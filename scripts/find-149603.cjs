const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = [
    'pickup_realtime_current',
    'pickup_rider_inventory_snapshots',
    'realtime_delivery_riders',
    'delivery_realtime_snapshots',
    'hub_roster',
    'rider_plan',
    'ai_chat_conversations',
    'ai_chat_messages',
    'ai_briefing_snapshots',
    'ai_analysis_snapshots'
  ];

  for (const t of tables) {
    try {
      const res = await prisma.$queryRawUnsafe(`
        SELECT * FROM "${t}" WHERE CAST(row_to_json("${t}") as text) LIKE '%BT_P2501_SDD%' OR CAST(row_to_json("${t}") as text) LIKE '%149603%';
      `);
      if (res.length > 0) {
        console.log(`Table ${t} MATCHED! count = ${res.length}`);
        console.log(res[0]);
      }
    } catch (e) {
      // ignore
    }
  }
}

main().finally(() => prisma.$disconnect());
