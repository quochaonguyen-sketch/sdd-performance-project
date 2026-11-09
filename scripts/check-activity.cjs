const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: logs } = await admin
    .from('activity_logs')
    .select('*')
    .eq('entity_type', 'ai_chat')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent ai_chat activity_logs:', logs?.map(l => ({
    created_at: l.created_at,
    action: l.action,
    message: l.message,
    raw_data: l.raw_data
  })));
}

main();
