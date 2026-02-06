import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function seedUser() {
    console.log("🌱 Force-Seeding Test User...");

    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL missing.");
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // Insert into auth.users directly
        // We need strictly necessary fields. 
        // ID is UUID. Email is text.
        // We ignore password/encrypted/etc as we won't login via Auth API.
        const email = `forced.user.${Date.now()}@test.com`;

        const res = await client.query(`
            INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            VALUES (
                gen_random_uuid(), 
                'authenticated', 
                'authenticated', 
                $1, 
                'dummy_hash', 
                now(), 
                '{"provider": "email", "providers": ["email"]}', 
                '{}', 
                now(), 
                now()
            )
            RETURNING id;
        `, [email]);

        const userId = res.rows[0].id;

        // Trigger should have created profile. Let's verify.
        console.log(`✅ User inserted: ${userId} (${email})`);

    } catch (err) {
        console.error("❌ Seeding Failed:", err);
    } finally {
        await client.end();
    }
}

seedUser();
