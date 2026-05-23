import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: users } = await supabase.from('users').select('id').limit(1);
  const userId = users?.[0]?.id;
  if (!userId) {
    const { data: p } = await supabase.from('profiles').select('id').limit(1);
    if (!p?.[0]?.id) return console.log("No users in DB");
    var realUser = p[0].id;
  } else {
    var realUser = userId;
  }

  const block = {
      user_id: realUser,
      date: "2026-05-23",
      start_time: "09:00:00",
      end_time: "10:00:00",
      title: "Test Block",
      block_type: "goal",
      status: "planned",
      pillar: "mind"
  };

  const { data, error } = await supabase.from('schedule_blocks').insert([block]).select('id');
  console.log("Insert result:", error || data);
}
run();
