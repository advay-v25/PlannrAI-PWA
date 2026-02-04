import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';
import { RoutineOutput } from '@/types/database';

const ROUTINE_PROMPT = `You are PlannrAI's biomechanics engine. 
Generate a safe, effective 5-15 minute routine.
Goal: {GOAL}
Type: {TYPE}
Context: {CONTEXT}
Scan Signals: {SIGNALS}

Strict Output Contract (JSON):
{
    "routine_type": "{TYPE}",
    "name": "Brief Title",
    "duration_minutes": number,
    "goal": "mobility|activation|recovery|downshift",
    "intensity": "low|medium",
    "steps": ["Step 1", "Step 2", ...],
    "avoid_today": "One warning sentence if needed",
    "best_time_window": "When to do this",
    "confidence_score": 0.0-1.0
}
`;

export const POST = secureApiRoute(
    async (context, body) => {
        const { routine_type, scan_id, time_available, pain_level } = body as {
            routine_type: 'morning' | 'night' | 'workout';
            scan_id?: string;
            time_available?: number;
            pain_level?: number;
        };

        const supabase = await createClient();

        // Fetch scan signals if ID provided
        let scanSignals = 'None';
        if (scan_id) {
            const { data: scan } = await supabase
                .from('scan_sessions')
                .select('signals')
                .eq('id', scan_id)
                .single();
            if (scan?.signals) {
                scanSignals = JSON.stringify(scan.signals);
            }
        }

        // Mock LLM Generation (High Fidelity)
        // In production, call Groq/OpenAI with ROUTINE_PROMPT

        let routine: RoutineOutput = {
            routine_type,
            name: 'Standard Protocol',
            duration_minutes: time_available || 10,
            goal: 'mobility',
            intensity: 'low',
            steps: [],
            best_time_window: 'Morning',
            confidence_score: 0.9,
            questions: []
        };

        if (routine_type === 'morning') {
            routine.name = "Morning Activation Flow";
            routine.goal = "activation";
            routine.steps = [
                "Neck Rotations (Clockwise/Counter) - 30s",
                "Cat-Cow Spinal Waves - 1 min",
                "Thoracic Openers (Book Openers) - 1 min each side",
                "Deep Squat Hold (Assisted) - 30s",
                "Arm Circles & Forward Folds - 1 min"
            ];
            routine.best_time_window = "Within 30 mins of waking";
            if (pain_level && pain_level > 4) {
                routine.avoid_today = "Avoid heavy loading on spine today.";
                routine.intensity = 'low';
            }
        } else if (routine_type === 'night') {
            routine.name = "Decompression Sequence";
            routine.goal = "downshift";
            routine.steps = [
                "Child's Pose - 2 mins",
                "Legs Up The Wall - 3 mins",
                "Box Breathing (4-4-4-4) - 2 mins"
            ];
            routine.best_time_window = "45 mins before sleep";
        } else {
            routine.name = "Mobility Check-in";
            routine.goal = "mobility";
            routine.steps = ["World's Greatest Stretch", "90/90 Hip Switches", "Plank to Down Dog"];
            routine.best_time_window = "Afternoon break";
        }

        // Store Recommendation
        const { data: rec, error } = await supabase
            .from('routine_recommendations')
            .insert({
                user_id: context.userId,
                routine_type,
                source: scan_id ? 'mixed' : 'context',
                routine,
                accepted: false
            })
            .select()
            .single();

        if (error) return apiError('Failed to save routine', 500);

        return apiSuccess(rec);
    },
    { requireAuth: true, auditAction: 'generate_routine' }
);
