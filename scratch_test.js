const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
    const match = envLocal.match(new RegExp(`${key}="(.*?)"`));
    return match ? match[1] : null;
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuth() {
    console.log("=== Testing Magic Link ===");
    try {
        const { data, error } = await supabase.auth.signInWithOtp({
            email: 'test@example.com',
            options: {
                emailRedirectTo: `http://localhost:3000/auth/callback`,
            },
        });
        if (error) {
            console.error("Magic Link failed:", error.message);
        } else {
            console.log("Magic Link success. Sent to:", 'test@example.com');
        }
    } catch (e) {
        console.error("Magic Link Exception:", e.message);
    }
    
    console.log("=== Testing Google OAuth ===");
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `http://localhost:3000/auth/callback`,
            },
        });
        if (error) {
            console.error("Google OAuth failed:", error.message);
        } else {
            console.log("Google OAuth success. URL to hit:");
            console.log(data.url);
        }
    } catch (e) {
        console.error("Google OAuth Exception:", e.message);
    }
}

testAuth();
