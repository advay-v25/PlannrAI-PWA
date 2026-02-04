'use client';

import { useState, useRef } from 'react';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { Upload, Camera, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScanUploadProps {
    onAnalysisComplete: (sessionId: string, signals: any[]) => void;
}

export function ScanUpload({ onAnalysisComplete }: ScanUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [storeImage, setStoreImage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);

        try {
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;

                const res = await fetch('/api/scans/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: base64,
                        store_mode: storeImage ? 'store_image' : 'signals_only'
                    })
                });

                const data = await res.json();

                if (!res.ok) throw new Error(data.error || 'Scan failed');

                if (data.data.readable) {
                    onAnalysisComplete(data.data.session_id, data.data.signals);
                } else {
                    setError(data.data.message || 'Image unclear. Please try again.');
                }
            };
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-fullspace-y-6">
            <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 text-center space-y-6">
                <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mx-auto ring-1 ring-[var(--color-primary)]/30">
                    <Camera className="w-8 h-8 text-[var(--color-primary)]" />
                </div>

                <div>
                    <h3 className="text-lg font-bold">Bio-Calibration Scan</h3>
                    <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto mt-2">
                        Upload a photo for posture and tension analysis. PlannrAI will generate a routine adapted to your physical state.
                    </p>
                </div>

                {/* Upload Area */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--glass-border)] hover:border-[var(--color-primary)] rounded-xl p-8 cursor-pointer transition-colors group"
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFile}
                        disabled={isUploading}
                    />

                    {isUploading ? (
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
                            <span className="text-sm font-medium">Analyzing biomechanics...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-[var(--text-tertiary)] group-hover:text-[var(--color-primary)]_transition-colors" />
                            <span className="font-bold">Tap to Upload</span>
                            <span className="text-xs text-[var(--text-tertiary)]">Front or Side view • Good lighting</span>
                        </div>
                    )}
                </div>

                {/* Privacy Toggle */}
                <div className="bg-black/20 rounded-xl p-4 text-left">
                    <GlassToggle
                        checked={storeImage}
                        onChange={setStoreImage}
                        label="Store image for history"
                        description={storeImage ? "Image will be encrypted and stored." : "Recommended: Signals only. Image is discarded immediately after analysis."}
                    />
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl flex items-center gap-3 text-sm text-left"
                        >
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <div>
                                <p className="font-bold">Analysis Failed</p>
                                <p className="opacity-80">{error}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <p className="text-xs text-[var(--text-tertiary)] text-center italic">
                PlannrAI is not a medical device. Suggestions are for wellness only.
            </p>
        </div>
    );
}
