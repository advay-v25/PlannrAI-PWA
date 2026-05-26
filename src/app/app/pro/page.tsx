'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { DynamicBackground } from '@/components/ui/DynamicBackground';
import { ArrowLeft, Target, Zap, CalendarSync, BrainCircuit, Sparkles } from 'lucide-react';

export default function ProPlanPage() {
    const router = useRouter();

    const features = [
        {
            icon: Target,
            title: "AI Expert Strategies",
            description: "Advanced algorithms break down your goals into perfectly sequenced roadmaps."
        },
        {
            icon: Zap,
            title: "Dynamic Habit Stacks",
            description: "Seamlessly link new habits to existing routines for unstoppable momentum."
        },
        {
            icon: CalendarSync,
            title: "Autonomous Weekly Review",
            description: "AI analyzes your execution history and recalibrates your entire schedule."
        },
        {
            icon: BrainCircuit,
            title: "Enhanced Proactivity",
            description: "Unlock 'Autopilot'. The AI coach anticipates burnout and shifts blocks for you."
        }
    ];

    return (
        <div className="min-h-screen relative flex flex-col items-center p-4 overflow-hidden bg-[#020104] text-white selection:bg-[var(--color-primary)]/30 selection:text-white font-[family-name:var(--font-geist-sans)] z-50">
            {/* Dynamic Ambient Background */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-80 mix-blend-screen">
                 <DynamicBackground variant="onboarding" />
            </div>

            {/* Back Button */}
            <div className="absolute top-6 left-6 md:top-8 md:left-8 z-20">
                <button
                    onClick={() => router.back()}
                    className="group flex items-center gap-2 text-sm font-semibold text-white/60 hover:text-white transition-colors py-2.5 px-5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 backdrop-blur-md shadow-lg"
                >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    Back to App
                </button>
            </div>

            <div className="relative z-10 w-full max-w-6xl flex flex-col items-center justify-center min-h-[90vh] py-10 px-4 mt-12 md:mt-0">
                
                {/* Hero Section */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="text-center space-y-8 mb-24 w-full"
                >
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-primary)]/[0.08] border border-[var(--color-primary)]/20 shadow-[0_0_40px_rgba(250,204,21,0.15)] mb-4"
                    >
                        <Sparkles className="w-4 h-4 text-[var(--color-primary)] animate-pulse" />
                        <span className="text-xs font-bold tracking-widest uppercase text-[var(--color-primary)] drop-shadow-sm">The Future of Planning</span>
                    </motion.div>
                    
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.1]">
                        <span className="block text-white/90 drop-shadow-2xl">Meet Your New</span>
                        <span className="block text-transparent bg-clip-text bg-gradient-to-br from-white via-[var(--color-primary)] to-orange-500 drop-shadow-[0_0_50px_rgba(250,204,21,0.4)] pt-2 pb-4">
                            Neural OS
                        </span>
                    </h1>
                    
                    <p className="text-white/50 text-lg md:text-2xl max-w-3xl mx-auto leading-relaxed font-light mt-6">
                        PlannrAI Pro elevates your workflow to complete autonomy. 
                        No more manual planning. Let the system orchestrate your life.
                    </p>
                </motion.div>

                {/* Elegant Features Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 w-full mb-24">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: index * 0.1 + 0.4 }}
                            className="group relative p-8 rounded-[2rem] bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/5 backdrop-blur-xl hover:bg-white/[0.06] hover:border-[var(--color-primary)]/30 transition-all duration-500 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            
                            <div className="relative z-10">
                                <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(250,204,21,0.15)]">
                                    <feature.icon className="w-6 h-6 text-[var(--color-primary)]" />
                                </div>
                                <h3 className="text-xl font-bold mb-3 text-white/90 group-hover:text-white transition-colors">{feature.title}</h3>
                                <p className="text-white/40 text-sm md:text-base leading-relaxed group-hover:text-white/70 transition-colors">
                                    {feature.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Launching Soon Pill */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, delay: 1 }}
                    className="flex justify-center w-full pb-10"
                >
                    <div className="relative group cursor-default">
                        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary)] to-orange-500 rounded-full blur-2xl opacity-20 group-hover:opacity-50 transition-opacity duration-700" />
                        <div className="relative px-12 py-5 rounded-full bg-black/60 border border-white/10 backdrop-blur-2xl flex items-center gap-4">
                            <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] animate-[ping_2s_ease-in-out_infinite] absolute left-12" />
                            <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] relative z-10" />
                            <span className="font-bold tracking-[0.2em] uppercase text-sm text-white/90 drop-shadow-md">Deploying Soon</span>
                        </div>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
