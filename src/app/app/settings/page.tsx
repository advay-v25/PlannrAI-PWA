
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock, Moon, Coffee, Layout, Brain, Zap, Activity,
    Calendar as CalendarIcon, Bell, ChevronRight, Save, RotateCcw
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProfilePreferences } from '@/lib/types/settings';
import { toast } from 'sonner';

// Sections
import CoreConstraints from './_components/core-constraints';
import WorkPreferences from './_components/work-preferences';
import AIControls from './_components/ai-controls';
import BodyDiet from './_components/body-diet';
import Integrations from './_components/integrations';

export default function SettingsPage() {
    const [preferences, setPreferences] = useState<ProfilePreferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('core');
    const [unsavedChanges, setUnsavedChanges] = useState<Partial<ProfilePreferences>>({});
    const [isPreviewing, setIsPreviewing] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await apiClient.get<{ preferences: ProfilePreferences }>('/api/profile/me');
            setPreferences(res.preferences);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = (patch: Partial<ProfilePreferences>) => {
        setUnsavedChanges(prev => ({ ...prev, ...patch }));
        // Optimistic update for UI feel
        setPreferences(prev => prev ? ({ ...prev, ...patch }) : null);
    };

    const saveChanges = async () => {
        if (!preferences) return;

        // If critical changes, trigger preview
        const isCritical = ['sleep_start', 'wake_time', 'meals_per_day', 'weekend_intensity'].some(k => k in unsavedChanges);

        if (isCritical) {
            setIsPreviewing(true);
            return;
        }

        // Otherwise direct save
        try {
            await apiClient.post('/api/settings/update', unsavedChanges);
            setUnsavedChanges({});
            toast.success("Settings saved");
        } catch (err) {
            toast.error("Failed to save");
            loadSettings(); // revert
        }
    };

    const handlePreviewApply = async () => {
        try {
            // 1. Get Preview & Patch
            const previewRes = await apiClient.post<any>('/api/settings/preview-regenerate', {
                reason: "User settings update",
                changes: unsavedChanges
            });

            // 2. Apply
            await apiClient.post('/api/settings/apply', { patch: previewRes.patch });

            setUnsavedChanges({});
            setIsPreviewing(false);
            toast.success("Schedule regenerated with new settings");

            // Trigger global refresh if needed
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('calendar-refresh'));
            }

        } catch (err) {
            toast.error("Failed to apply changes");
        }
    };

    if (loading || !preferences) return <div className="p-8">Loading settings...</div>;

    const sections = [
        { id: 'core', label: 'Core Constraints', icon: Clock },
        { id: 'work', label: 'Work Pillars', icon: Layout },
        { id: 'body', label: 'Body & Diet', icon: Activity },
        { id: 'ai', label: 'Intelligence', icon: Brain },
        { id: 'integrations', label: 'Integrations', icon: CalendarIcon },
    ];

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-64 border-r border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/30 backdrop-blur-xl p-4 hidden md:flex flex-col gap-2">
                <h1 className="text-xl font-bold px-4 mb-4 text-[var(--text-primary)]">Control Center</h1>
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                            activeSection === s.id
                                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/20"
                                : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]"
                        )}
                    >
                        <s.icon className="w-4 h-4" />
                        {s.label}
                    </button>
                ))}
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
                <div className="max-w-3xl mx-auto space-y-8 pb-24">
                    {activeSection === 'core' && (
                        <CoreConstraints preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'work' && (
                        <WorkPreferences preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'body' && (
                        <BodyDiet preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'ai' && (
                        <AIControls preferences={preferences} onChange={handleUpdate} />
                    )}
                    {activeSection === 'integrations' && (
                        <Integrations preferences={preferences} onChange={handleUpdate} />
                    )}
                </div>

                {/* Floating Action Bar (if changes) */}
                <AnimatePresence>
                    {Object.keys(unsavedChanges).length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-2xl backdrop-blur-2xl rounded-2xl p-4 flex items-center gap-4 z-50 w-[90%] max-w-md"
                        >
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Unsaved changes</h4>
                                <p className="text-xs text-[var(--text-secondary)]">{Object.keys(unsavedChanges).length} setting(s) modified</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => loadSettings()}>Reset</Button>
                            <Button onClick={saveChanges} className="bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]">
                                {isPreviewing ? 'Applying...' : 'Save Changes'}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Preview Modal (Simple) */}
                {isPreviewing && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-[var(--color-bg-primary)] border border-[var(--glass-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                            <h3 className="text-lg font-bold">Heads Up</h3>
                            <p className="text-sm text-[var(--text-secondary)]">
                                Changing core constraints requires restructuring your entire schedule. This might move existing blocks.
                            </p>
                            <div className="flex gap-3 justify-end mt-4">
                                <Button variant="outline" onClick={() => setIsPreviewing(false)}>Cancel</Button>
                                <Button onClick={handlePreviewApply} className="bg-[var(--color-primary)] text-white">
                                    Regenerate Schedule
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
