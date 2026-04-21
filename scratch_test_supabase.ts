import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuth() {
  console.log("Testing magic link...");
  const { data, error } = await supabase.auth.signInWithOtp({
    email: 'test@example.com',
    options: {
      emailRedirectTo: `http://localhost:3000/auth/callback`,
    },
  });
  console.log("Magic link result:", { data, error });

  console.log("Testing Google OAuth...");
  const { data: oData, error: oError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `http://localhost:3000/auth/callback`,
    },
  });
  console.log("Google OAuth result:", { data: oData, error: oError });
}

testAuth();
