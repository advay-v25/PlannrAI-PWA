// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { MemoryService } from '../src/lib/services/memory-service';
import { generateAIResponse } from '../src/lib/ai/groq-client';
import { ContextBuilder } from '../src/lib/agents/context-builder';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function runVerification() {
    console.log("🗣️  VERIFYING TALK = ACTION CONTRACT...");
    const isServiceKey = SUPABASE_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log("   Using Service Role Key:", isServiceKey);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Get User
    const { data: user } = await supabase.from('profiles').select('id').limit(1).single();
    if (!user) throw new Error("No user found");
    const userId = user.id;

    // 2. Test Signal Logging
    // 2. Test Signal Logging
    console.log("📝 Testing Signal Logging...");
    await MemoryService.logSignal(userId, 'rejection', "I hate early meetings", { context: "8am meeting" }, supabase);

    await new Promise(r => setTimeout(r, 2000)); // Wait for persistence

    const signals = await MemoryService.getRecentSignals(userId, 5, supabase);
    const found = signals.some((s: any) => s.meta?.content === "I hate early meetings");

    if (found) {
        console.log("✅ SUCCESS: Signal logged and retrieved.");
    } else {
        console.error("❌ FAILURE: Signal not found in storage.");
    }

    // 3. Test Context Injection
    console.log("💉 Testing Context Injection...");
    // We need to instantiate ContextBuilder logic manually or mock it if we can't easily import everything.
    // Assuming context-builder uses MemoryService internally.
    const context = await ContextBuilder.build(userId, supabase);

    if (context.recentSignals && context.recentSignals.length > 0) {
        console.log(`✅ SUCCESS: Context contains ${context.recentSignals.length} signals.`);
    } else {
        console.error("❌ FAILURE: Context missing signals.");
    }

    // 4. Test Coach Contract (LLM)
    console.log("🤖 Testing Coach Contract (LLM)...");
    const prompt = `User: "I'm overwhelmed."
    Plan: Reduce intensity.
    Options: [ { label: "Clear afternoon", patch: {} } ]`;

    const response = await generateAIResponse(prompt, 'COACH', userId);
    console.log("   Coach Response:\n" + response);

    const lineCount = response.split('\n').filter(l => l.trim().length > 0).length;
    if (lineCount <= 2 || response.length < 200) {
        console.log("✅ SUCCESS: Response is concise (Chief of Staff style).");
    } else {
        console.warn("⚠️  WARNING: Response might be too verbose.");
    }

}

runVerification().catch(console.error);
