const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function updatePassword() {
  const { data, error } = await supabase.auth.admin.updateUserById(
    'c59669c5-955e-4e82-95a8-267e0812f180',
    { password: 'password' }
  );
  if (error) {
    console.error('Error updating password:', error);
  } else {
    console.log('Successfully updated password for advay.s123@gmail.com');
  }
}

updatePassword();
