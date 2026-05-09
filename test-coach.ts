import { createClient } from '@supabase/supabase-js';

async function test() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Note: API requires auth. I need the session cookie or token.
  console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
}
test();
