'use client';

import { useState } from 'react';
import { useOnboardingStore } from '@/stores';
import { Camera, Upload, ShieldCheck, SkipForward } from 'lucide-react';

export function Step7Scan() {
    const { updateData, nextStep } = useOnboardingStore();
    const [uploading, setUploading] = useState(false);

    const handleSkip = () => {
        updateData({ scan_skipped: true });
        nextStep();
    };

    const handleUpload = () => {
        setUploading(true);
        // Mock upload delay
        setTimeout(() => {
            setUploading(false);
            // Mock success -> proceed
            // Ideally we'd store a 'scan_id' or 'signals'
            nextStep();
        }, 1500);
    };

    return (
        <div className="h-full flex flex-col items-center justify-center space-y-10 max-w-xl mx-auto w-full text-center">
            <div className="space-y-4">
                <div className="w-20 h-20 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mx-auto ring-1 ring-[var(--color-primary)]/30">
                    <Camera className="w-8 h-8 text-[var(--color-primary)]" />
                </div>
                <h2 className="text-3xl font-display font-light">Bio-Calibration</h2>
                <p className="text-[var(--color-text-secondary)] font-light max-w-sm mx-auto">
                    PlannrAI can adapt routines to your physical state (posture, tension, fatigue).
                </p>
            </div>

            <div className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-8 space-y-6">
                <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold mb-4">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Secure execution. Data processed locally then discarded.</span>
                </div>

                <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full py-6 rounded-xl border border-dashed border-[var(--glass-border)] hover:border-[var(--color-primary)] hover:bg-[var(--glass-bg-hover)] transition-all group relative overflow-hidden"
                >
                    {uploading ? (
                        <span className="flex items-center justify-center gap-2 animate-pulse text-[var(--color-primary)]">
                            Analyzing points...
                        </span>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Upload className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-[var(--color-primary)] transition-colors" />
                            <span className="font-bold">Upload Snapshot</span>
                            <span className="text-xs text-[var(--text-tertiary)]">Face or Body (optional)</span>
                        </div>
                    )}
                </button>
            </div>

            <button
                onClick={handleSkip}
                className="flex flex-col items-center gap-1 text-[var(--color-text-secondary)] hover:text-white transition-colors group"
            >
                <span className="flex items-center gap-2 text-sm">
                    Skip Bio-Calibration <SkipForward className="w-4 h-4" />
                </span>
                <span className="text-[10px] opacity-0 group-hover:opacity-50 transition-opacity">
                    Using statistical baseline for now.
                </span>
            </button>
        </div>
    );
}
