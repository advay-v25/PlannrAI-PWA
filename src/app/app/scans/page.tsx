'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Upload, Camera, Dumbbell, Utensils, ScanFace, FileText, Loader2, RefreshCw } from 'lucide-react';
import { PhotoUploader } from '@/components/scans/photo-uploader';
import { useToast } from '@/components/ui/toast';

type ScanType = 'physique' | 'equipment' | 'food' | 'bloodwork';

const SCAN_TYPES = [
    { id: 'physique', label: 'Physique', icon: ScanFace, desc: 'Analyze body composition & muscle groups' },
    { id: 'equipment', label: 'Equipment', icon: Dumbbell, desc: 'Scan gym gear to generate workouts' },
    { id: 'food', label: 'Nutrition', icon: Utensils, desc: 'Scan meals for macro analysis' },
    { id: 'bloodwork', label: 'Bloodwork', icon: FileText, desc: 'Analyze biomarkers (Coming Soon)' },
];

export default function ScansPage() {
    const { showToast } = useToast();
    const [selectedType, setSelectedType] = useState<ScanType | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleUploadComplete = async (file: File) => {
        setIsAnalyzing(true);
        // Simulate upload & analyze for now, pending API implementation
        // Real implementation will call /api/scans/analyze
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', selectedType || 'general');

            const res = await fetch('/api/scans/analyze', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (data.success) {
                setResult(data.analysis);
                showToast('Analysis Complete', 'success');
            } else {
                showToast(data.error || 'Analysis failed', 'error');
            }
        } catch (e) {
            showToast('Failed to analyze image', 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const reset = () => {
        setSelectedType(null);
        setResult(null);
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Camera className="w-6 h-6 text-[var(--color-primary)]" />
                        Bio-Scan
                    </h1>
                    <p className="text-[var(--color-text-muted)]">
                        AI Vision Analysis for Hyper-Personalization
                    </p>
                </div>
                {result && (
                    <GlassButton size="sm" variant="ghost" onClick={reset}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        New Scan
                    </GlassButton>
                )}
            </div>

            {/* Type Selector */}
            {!selectedType && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SCAN_TYPES.map((type) => (
                        <motion.button
                            key={type.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedType(type.id as ScanType)}
                            className="text-left"
                        >
                            <GlassCard className="h-full hover:bg-[var(--glass-bg-hover)] transition-colors border-2 border-transparent hover:border-[var(--color-primary)]/30">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0">
                                        <type.icon className="w-6 h-6 text-[var(--color-primary)]" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg mb-1">{type.label}</h3>
                                        <p className="text-sm text-[var(--color-text-muted)]">{type.desc}</p>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.button>
                    ))}
                </div>
            )}

            {/* Upload Area */}
            {selectedType && !result && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <button onClick={() => setSelectedType(null)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                            ← Back
                        </button>
                        <h2 className="text-lg font-bold">Scanning: {SCAN_TYPES.find(t => t.id === selectedType)?.label}</h2>
                    </div>

                    <GlassCard className="p-8">
                        {isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-4">
                                <div className="relative">
                                    <div className="w-16 h-16 rounded-full border-4 border-[var(--color-primary)]/30 animate-pulse" />
                                    <Loader2 className="w-8 h-8 text-[var(--color-primary)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                                </div>
                                <p className="text-[var(--color-text-secondary)] animate-pulse">Analyzing visual data...</p>
                            </div>
                        ) : (
                            <PhotoUploader
                                type={selectedType}
                                onUpload={handleUploadComplete}
                            />
                        )}
                    </GlassCard>
                </motion.div>
            )}

            {/* Results Area */}
            {result && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                >
                    <GlassCard padding="md" className="border-l-4 border-[var(--color-success)]">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[var(--color-success)]" />
                            Analysis Complete
                        </h3>
                        <div className="prose prose-invert max-w-none">
                            <p>{result.summary}</p>
                        </div>
                    </GlassCard>

                    {/* TODO: Suggestions UI will go here */}
                    <div className="text-center text-[var(--color-text-muted)] text-sm">
                        Suggestions UI coming in next step...
                    </div>
                </motion.div>
            )}
        </div>
    );
}

function Sparkles(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" />
            <path d="M9 5h4" />
            <path d="M5 19v2" />
            <path d="M9 19h2" />
        </svg>
    )
}
