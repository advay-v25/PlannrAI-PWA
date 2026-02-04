'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanUpload } from '@/components/routines/scan-upload';
import { RoutineCard } from '@/components/routines/routine-card';
import { GlassButton } from '@/components/ui/glass-button';
import { ArrowLeft, Sparkles, Activity } from 'lucide-react';
import type { RoutineRecommendation } from '@/types/database';

export default function BioCalibrationPage() {
    const router = useRouter();
    const [scannedSessionId, setScannedSessionId] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<RoutineRecommendation[]>([]);
    const [loading, setLoading] = useState(false);

    // After scan, generate routines
    const handleScanComplete = async (sessionId: string, signals: any[]) => {
        setScannedSessionId(sessionId);
        setLoading(true);

        try {
            // Generate all 3 types for demo
            const types = ['morning', 'night', 'workout'] as const;
            const newRecs = [];

            for (const type of types) {
                const res = await fetch('/api/routines/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        routine_type: type,
                        scan_id: sessionId,
                        time_available: 15
                    })
                });
                const data = await res.json();
                if (data.success) {
                    newRecs.push(data.data);
                }
            }
            setRecommendations(newRecs);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSchedule = async (recId: string, time: string, date: string) => {
        const res = await fetch('/api/routines/apply-to-calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recommendation_id: recId,
                start_time: time,
                date
            })
        });

        if (res.ok) {
            // Update local state to show accepted
            setRecommendations(prev => prev.map(r =>
                r.id === recId ? { ...r, accepted: true } : r
            ));
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div>
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-white transition-colors mb-4 text-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Settings
                </button>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--color-primary)]/20 rounded-lg">
                        <Activity className="w-6 h-6 text-[var(--color-primary)]" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-display">Bio-Calibration</h1>
                        <p className="text-sm text-[var(--color-text-secondary)]">Adapt your routines to your body.</p>
                    </div>
                </div>
            </div>

            {/* Scan Section */}
            {!scannedSessionId && (
                <section>
                    <ScanUpload onAnalysisComplete={handleScanComplete} />
                </section>
            )}

            {/* Results */}
            {(loading || recommendations.length > 0) && (
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom duration-700">
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] uppercase tracking-wider font-bold">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        Generated Protocols
                    </div>

                    {loading ? (
                        <div className="space-y-4 opacity-50">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-32 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {recommendations.map(rec => (
                                <RoutineCard
                                    key={rec.id}
                                    recommendation={rec}
                                    onSchedule={(time, date) => handleSchedule(rec.id, time, date)}
                                />
                            ))}
                        </div>
                    )}

                    {recommendations.length > 0 && (
                        <GlassButton
                            variant="ghost"
                            className="w-full mt-8"
                            onClick={() => {
                                setScannedSessionId(null);
                                setRecommendations([]);
                            }}
                        >
                            Start New Scan
                        </GlassButton>
                    )}
                </section>
            )}
        </div>
    );
}
