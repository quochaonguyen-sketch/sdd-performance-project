const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');

const prisma = new PrismaClient();

const SAMPLE_RIDERS = [
  { name: 'NGUYỄN PHẠM THANH THANH', id: '157704', area: 'KV2', district: 'Quận Bình Thạnh', ward: 'Phường 15', zone: 'Z2.01.GĐ.04' },
  { name: 'LƯƠNG HÒA THIỆN', id: '158120', area: 'KV2', district: 'Quận 7', ward: 'Phường Tân Thuận Tây', zone: 'Z2.03.TT.02' },
  { name: 'PHÙNG DUY HƯNG', id: '156402', area: 'KV1', district: 'Quận 5', ward: 'Phường 9', zone: 'Z1.01.AĐ.05' },
  { name: 'BỬU VĨNH BẢO LONG', id: '159821', area: 'KV2', district: 'Quận Bình Thạnh', ward: 'Phường 12', zone: 'Z2.01.BT.01' },
  { name: 'NGUYỄN THÀNH LẬP', id: '121382', area: 'KV5', district: 'Quận 12', ward: 'Phường Tân Thới Nhất', zone: 'Z5.02.ĐHT.03' },
  { name: 'TRƯƠNG MINH HẢI', id: '157699', area: 'KV2', district: 'Thành phố Thủ Đức', ward: 'Phường Thủ Thiêm', zone: 'Z2.02.AK.05' },
  { name: 'ĐINH QUỐC KHÁNH', id: '158556', area: 'KV2', district: 'Thành phố Thủ Đức', ward: 'Phường Thảo Điền', zone: 'Z2.02.AK.04' },
  { name: 'LÊ HỒNG LUẬN', id: '157821', area: 'KV4', district: 'Quận Tân Bình', ward: 'Phường 14', zone: 'Z4.02.TB.02' },
  { name: 'LÂM VĂN THUẬN', id: '155310', area: 'KV1', district: 'Quận 10', ward: 'Phường 15', zone: 'Z1.02.HH.04' },
  { name: 'LỮ THANH LÂM', id: '130078', area: 'KV1', district: 'Quận 10', ward: 'Phường 8', zone: 'Z1.02.DH.04' },
  { name: 'TRẦN HỮU MẠNH', id: '162858', area: 'KV1', district: 'Quận 1', ward: 'Phường Bến Nghé', zone: 'Z1.01.BN.01' },
  { name: 'NGUYỄN QUỐC TOÀN', id: '158197', area: 'KV3', district: 'Quận 4', ward: 'Phường 13', zone: 'Z3.01.Q4.03' },
  { name: 'LÊ HOÀNG PHÚC', id: '158659', area: 'KV3', district: 'Quận 8', ward: 'Phường 4', zone: 'Z3.02.Q8.01' },
  { name: 'ĐỖ KHÁNH LINH', id: '157696', area: 'KV5', district: 'Quận Gò Vấp', ward: 'Phường 10', zone: 'Z5.01.GV.02' },
  { name: 'HỒ THẾ LỘC', id: '160451', area: 'KV4', district: 'Quận Phú Nhuận', ward: 'Phường 2', zone: 'Z4.01.PN.03' }
];

const ONHOLD_REASONS = [
  '170 - Recipient reschedule',
  '169 - Recipient unavailable for parcel',
  '171 - Security inspection',
  '187 - Severe weather',
  '0'
];

function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomLetter() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return letters[Math.floor(Math.random() * letters.length)];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function generateOrdersForDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const count = 30 + Math.floor(Math.random() * 18); // 30 to 47 orders
  const orders = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    let shipmentId;
    do {
      shipmentId = `VN26${randomDigits(9)}${randomLetter()}`;
    } while (usedIds.has(shipmentId));
    usedIds.add(shipmentId);

    const rider = SAMPLE_RIDERS[Math.floor(Math.random() * SAMPLE_RIDERS.length)];
    const isDelivered = Math.random() < 0.90;
    const isOnhold = !isDelivered && Math.random() < 0.6;
    const isLate = Math.random() < 0.28; // ~28% late
    const isAttempt2 = Math.random() < 0.20; // ~20% attempt 2

    // Creation time: 08:00 to 15:00
    const createHour = 8 + Math.floor(Math.random() * 8);
    const createMin = Math.floor(Math.random() * 60);
    const createSec = Math.floor(Math.random() * 60);
    const createdAtDate = new Date(Date.UTC(year, month - 1, day, createHour - 7, createMin, createSec));
    const createdAtStr = createdAtDate.toISOString();

    // SOC pending: 15 to 40 mins later
    const socPendingDate = new Date(createdAtDate.getTime() + (15 + Math.floor(Math.random() * 25)) * 60000);
    const socPendingStr = socPendingDate.toISOString();

    // Received at hub: 15 to 35 mins later
    const receivedDate = new Date(socPendingDate.getTime() + (15 + Math.floor(Math.random() * 20)) * 60000);
    const receivedStr = receivedDate.toISOString();

    // Delivering: 20 to 50 mins later
    const deliveringDate = new Date(receivedDate.getTime() + (20 + Math.floor(Math.random() * 30)) * 60000);
    const deliveringStr = deliveringDate.toISOString();

    let deliveredStr = null;
    let onholdStr = null;
    let rawStatus = 'Delivered';
    let onholdReason = '0';
    let attempt = 1;

    // For past historical snapshots, only Delivered orders are stored
    const delDate = new Date(createdAtDate.getTime() + (isLate ? (245 + Math.floor(Math.random() * 135)) : (80 + Math.floor(Math.random() * 145))) * 60000);
    deliveredStr = delDate.toISOString();
    attempt = isAttempt2 ? 2 : 1;
    if (isAttempt2) {
      const ohDate = new Date(deliveringDate.getTime() + 45 * 60000);
      onholdStr = ohDate.toISOString();
      onholdReason = ONHOLD_REASONS[Math.floor(Math.random() * 2)];
    }

    orders.push({
      shipment_id: shipmentId,
      tracking_number: shipmentId,
      raw_status: rawStatus,
      area: rider.area,
      district: rider.district,
      ward: rider.ward,
      zone: rider.zone,
      driver_id: rider.id,
      driver_name: rider.name,
      attempt,
      onhold_reason: onholdReason,
      created_at: createdAtStr,
      received_at: receivedStr,
      delivering_at: rawStatus === 'LMhub_received' ? null : deliveringStr,
      delivered_at: deliveredStr,
      onhold_at: onholdStr,
      soc_pending_at: socPendingStr,
    });
  }

  return orders;
}

async function main() {
  console.log('Starting backfill for past 30 days of iPhone data...');

  // Target date range: 2026-10-10 to 2026-11-05 (27 dates)
  const existingRows = await prisma.$queryRawUnsafe(`
    SELECT report_date::text as day 
    FROM public.wh_tracking_snapshots 
    WHERE station_id = '4232';
  `);
  const existingSet = new Set(existingRows.map(r => r.day));

  const allDates = [];
  const start = new Date(Date.UTC(2026, 9, 10)); // 2026-10-10
  const end = new Date(Date.UTC(2026, 10, 5));   // 2026-11-05

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    allDates.push(`${y}-${m}-${day}`);
  }

  const missingDates = allDates.filter(d => !existingSet.has(d));
  console.log(`Found ${missingDates.length} missing dates to backfill:`, missingDates);

  for (const dateStr of missingDates) {
    const orders = generateOrdersForDate(dateStr);
    const [y, m, d] = dateStr.split('-').map(Number);
    const snapshotAt = new Date(Date.UTC(y, m - 1, d, 11, 0, 0)).toISOString(); // 18:00 VN time
    const jobId = crypto.randomUUID();

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO public.wh_tracking_snapshots(station_id, report_date, snapshot_at, job_id, orders)
      VALUES ($1, $2::date, $3::timestamptz, $4::uuid, $5::jsonb)
      ON CONFLICT(station_id, report_date) 
      DO UPDATE SET orders = EXCLUDED.orders, snapshot_at = EXCLUDED.snapshot_at;
      `,
      '4232',
      dateStr,
      snapshotAt,
      jobId,
      JSON.stringify(orders)
    );

    console.log(`Backfilled ${dateStr}: ${orders.length} orders`);
  }

  const totalSnapshots = await prisma.$queryRawUnsafe(`
    SELECT count(1) as total_days, min(report_date)::text as from_date, max(report_date)::text as to_date 
    FROM public.wh_tracking_snapshots 
    WHERE station_id = '4232';
  `);
  console.log('Finished backfill! Snapshots summary:', totalSnapshots);
}

main().catch(console.error).finally(() => prisma.$disconnect());
