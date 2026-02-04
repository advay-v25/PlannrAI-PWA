import { secureApiRoute, apiSuccess, apiError } from '@/lib/security/api-protection';
import { createClient } from '@/lib/supabase/server';

export const POST = secureApiRoute(
    async (context, body) => {
        const { image_base64, store_mode } = body as { image_base64?: string; store_mode: 'signals_only' | 'store_image' };

        // Mock Analysis Layer (since Vision API key is not set)
        // In production, this would send image_base64 to an LLM Vision model

        const isReadable = Math.random() > 0.1; // 90% success rate mock

        let signals: Array<{ type: string; content: string; confidence: number }> = [];
        let confidence = 0.0;
        let notes = '';

        if (isReadable) {
            signals = [
                { type: 'posture', content: 'Slight forward head posture detected', confidence: 0.85 },
                { type: 'tension', content: 'Elevated shoulders suggesting upper trapezius tension', confidence: 0.78 },
                { type: 'symmetry', content: 'Left shoulder slightly higher than right', confidence: 0.65 }
            ];
            confidence = 0.82;
            notes = 'Clear frontal view.';
        } else {
            notes = 'Image too blurry or lighting insufficient.';
        }

        // Store Session
        const supabase = await createClient();

        // If store_mode is signals_only, discard image
        // If store_image, we would upload to storage first. For MVP, we skip storage logic.

        const { data: session, error } = await supabase
            .from('scan_sessions')
            .insert({
                user_id: context.userId,
                store_mode,
                image_url: store_mode === 'store_image' ? 'mock_storage_url_jpeg' : null,
                signals,
                confidence_score: confidence,
                readable: isReadable,
                notes
            })
            .select()
            .single();

        if (error) return apiError('Failed to save scan session', 500);

        return apiSuccess({
            session_id: session.id,
            readable: isReadable,
            signals,
            message: isReadable ? 'Analysis complete' : 'Analysis unclear. Please try better lighting.'
        });
    },
    { requireAuth: true, auditAction: 'scan_analyze' }
);
