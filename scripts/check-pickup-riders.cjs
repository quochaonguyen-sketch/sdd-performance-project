const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: p } = await admin
    .from('pickup_realtime_current')
    .select('*')
    .eq('id', 1)
    .single();

  console.log('pickup_realtime_current snapshot_at:', p?.snapshot_at);
  const riders = p?.riders || [];
  console.log('Total pickup riders:', riders.length);

  // Look for any rider with 185 picked or 188 assigned
  const r185 = riders.filter(r => r.total_pickup_quantity === 185 || r.assigned_orders === 188);
  console.log('Riders with 185 picked or 188 assigned:', r185);

  // Look for any rider with zone containing BT_P25
  const rBT25 = riders.filter(r => (r.zones || '').includes('BT_P25'));
  console.log('Riders with BT_P25 in zones:', rBT25);

  // Look for rider 149603
  const rCode = riders.filter(r => r.driver_id === '149603');
  console.log('Riders with 149603:', rCode);
}

main();
