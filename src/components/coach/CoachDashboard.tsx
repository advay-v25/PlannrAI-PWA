import { useEffect, useState, useMemo } from 'react';
import { useCoach } from '@/hooks/use-coach';
import { CoachOptionCard } from './CoachOptionCard';
import { CoachChat } from './CoachChat';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useUserStore, useGoalsStore, useDailyLogStore } from '@/stores';
import { Sparkles, Target, Activity, Zap, CheckCircle2, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCoachAnalytics } from '@/hooks/use-coach-analytics';

export function CoachDashboard({ onCalendarUpdate }: { onCalendarUpdate?: () => void }) {
    const { profile } = useUserStore();
    const { goals } = useGoalsStore();
    const { todayLog } = useDailyLogStore();
    const { getLatestMessageWithOptions, messages, applyOption } = useCoach();
    const { data: analytics, isLoading: analyticsLoading } = useCoachAnalytics();
    
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
        setCurrentTime(new Date());
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const greeting = !mounted || !currentTime ? 'Welcome' 
                   : currentTime.getHours() < 12 ? 'Good Morning' 
                   : currentTime.getHours() < 18 ? 'Good Afternoon' 
                   : 'Good Evening';
                   
    const displayName = profile?.full_name?.split(' ')[0] || 'Advay';

    // Extract options
    const latestMessage = getLatestMessageWithOptions();
    const options = latestMessage?.options || [];
    
    const heroOption = options.find(o => o.recommended) || options[0];
    const alternativeOptions = options.filter(o => o.id !== heroOption?.id);

    // Calculate Real Pillar Progress
    const calculateProgress = (pillar: string) => {
        const pillarGoals = goals.filter(g => g.pillar === pillar && !g.is_paused);
        if (pillarGoals.length === 0) return 0;
        
        const totalTarget = pillarGoals.reduce((sum, g) => sum + (g.weekly_target_minutes || 0), 0);
        if (totalTarget === 0) return 0;
        
        // Use backend analytics actuals, or fallback to the goal's raw tracked minutes
        const actualFromAnalytics = analytics?.pillar_split?.[pillar as keyof typeof analytics.pillar_split];
        const actualFromGoal = pillarGoals.reduce((sum, g) => sum + (g.total_completed_minutes || 0), 0);
        
        const actual = actualFromAnalytics || actualFromGoal || 0;
        return Math.min(100, Math.round((actual / totalTarget) * 100));
    };

    const mindGoalsProgress = calculateProgress('mind');
    const bodyGoalsProgress = calculateProgress('body');
    const craftGoalsProgress = calculateProgress('craft');
    
    const todayLoad = analytics?.metrics?.execution_rate || 0;

    const fadeInUp: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    if (!mounted) return <div className="max-w-[1400px] mx-auto px-6 py-12 min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-white/20 animate-spin" /></div>;

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 relative font-sans">

            
            {/* Header */}
            <motion.div 
                variants={fadeInUp} 
                initial="hidden" 
                animate="visible"
                className="flex items-end justify-between px-2"
            >
                <div>
                    <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-tight text-white leading-tight">
                        {greeting}, <br className="sm:hidden" />
                        <span className="text-white/60">{displayName}</span>
                    </h1>
                </div>
                <div className="hidden sm:block text-right">
                    <p className="text-sm font-medium text-white/40 tracking-tight">
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                </div>
            </motion.div>

            {/* Main Layout Grid: 2 Columns */}
            <motion.div 
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6"
            >
                {/* LEFT COLUMN: Chat & Actions (Spans 8 columns) */}
                <div className="lg:col-span-8 flex flex-col gap-5 sm:gap-6">
                    
                    {/* Ask Donna Chat */}
                    <motion.div variants={fadeInUp} className="flex flex-col min-h-[600px] h-[calc(100vh-200px)] max-h-[800px]">
                        <div className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[32px] p-5 sm:p-7 flex-1 flex flex-col relative overflow-hidden shadow-2xl">
                            {/* Apple Intelligence style subtle glow */}
                            <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-orange-500/10 via-purple-500/5 to-transparent rounded-full blur-[80px] pointer-events-none" />
                            
                            <div className="flex items-center justify-between mb-5 z-10">
                                <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white/90 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-orange-400" />
                                    Donna
                                </h2>
                                <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/[0.06] text-white/50 border border-white/[0.04]">
                                    Intelligence Layer
                                </span>
                            </div>
                            
                            <div className="flex-1 z-10 bg-black/40 rounded-[24px] border border-white/[0.04] overflow-hidden flex flex-col">
                                <CoachChat />
                            </div>
                        </div>
                    </motion.div>

                    {/* Recommended Actions */}
                    <motion.div variants={fadeInUp} className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[32px] p-6 sm:p-8">
                        <h3 className="text-[13px] font-semibold tracking-widest text-white/40 mb-6 uppercase flex items-center gap-2">
                            <Zap className="w-4 h-4 text-orange-400" />
                            Recommended Actions
                        </h3>
                        
                        {options.length > 0 ? (
                            <div className="space-y-4">
                                {heroOption && (
                                    <CoachOptionCard 
                                        option={heroOption}
                                        onSelect={() => applyOption(latestMessage!.id, heroOption.id).then(() => onCalendarUpdate?.())}
                                        disabled={false}
                                        minimalMode={false}
                                    />
                                )}
                                
                                {alternativeOptions.length > 0 && (
                                    <div className="pt-2">
                                        <h4 className="text-xs font-semibold tracking-widest text-white/30 uppercase mb-3 px-1">Alternatives</h4>
                                        <div className="space-y-3">
                                            {alternativeOptions.map(opt => (
                                                <CoachOptionCard 
                                                    key={opt.id}
                                                    option={opt}
                                                    onSelect={() => applyOption(latestMessage!.id, opt.id).then(() => onCalendarUpdate?.())}
                                                    disabled={false}
                                                    minimalMode={true}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-48 flex flex-col items-center justify-center text-center rounded-[24px] bg-white/[0.02] border border-white/[0.04]">
                                <CheckCircle2 className="w-8 h-8 text-white/20 mb-3" />
                                <p className="text-white/60 font-medium tracking-tight text-sm">Perfectly Aligned</p>
                                <p className="text-white/30 text-[13px] mt-1 max-w-[200px]">No pending optimizations.</p>
                            </div>
                        )}
                    </motion.div>

                </div>

                {/* RIGHT COLUMN: Pillars, Strategy & Decisions (Spans 4 columns) */}
                <div className="lg:col-span-4 flex flex-col gap-5 sm:gap-6">
                    
                    {/* Pillars Grid */}
                    <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-4 sm:gap-5">
                        {/* Mind */}
                        <div className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[28px] p-5 sm:p-6 relative overflow-hidden hover:bg-[#1c1c1e]/60 transition-colors duration-500 group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-10 h-10 rounded-[14px] bg-mind/10 flex items-center justify-center">
                                    <Target className="w-5 h-5 text-mind" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[40px] font-medium tracking-tighter text-white leading-none">{mindGoalsProgress}</span>
                                <span className="text-lg font-medium text-white/30">%</span>
                            </div>
                            <p className="text-sm text-white/40 mt-2 font-medium tracking-tight">Mind Goals</p>
                        </div>
                        
                        {/* Body */}
                        <div className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[28px] p-5 sm:p-6 relative overflow-hidden hover:bg-[#1c1c1e]/60 transition-colors duration-500 group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-10 h-10 rounded-[14px] bg-body/10 flex items-center justify-center">
                                    <Activity className="w-5 h-5 text-body" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[40px] font-medium tracking-tighter text-white leading-none">{bodyGoalsProgress}</span>
                                <span className="text-lg font-medium text-white/30">%</span>
                            </div>
                            <p className="text-sm text-white/40 mt-2 font-medium tracking-tight">Body Goals</p>
                        </div>

                        {/* Craft */}
                        <div className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[28px] p-5 sm:p-6 relative overflow-hidden hover:bg-[#1c1c1e]/60 transition-colors duration-500 group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-10 h-10 rounded-[14px] bg-craft/10 flex items-center justify-center">
                                    <Zap className="w-5 h-5 text-craft" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[40px] font-medium tracking-tighter text-white leading-none">{craftGoalsProgress}</span>
                                <span className="text-lg font-medium text-white/30">%</span>
                            </div>
                            <p className="text-sm text-white/40 mt-2 font-medium tracking-tight">Craft Goals</p>
                        </div>

                        {/* Momentum */}
                        <div className="bg-orange-500/5 backdrop-blur-3xl border border-orange-500/10 rounded-[28px] p-5 sm:p-6 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none" />
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="w-10 h-10 rounded-[14px] bg-orange-500/10 flex items-center justify-center">
                                    <Activity className="w-5 h-5 text-orange-400" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-0.5 relative z-10">
                                <span className="text-[40px] font-medium tracking-tighter text-white leading-none">{todayLoad}</span>
                                <span className="text-lg font-medium text-white/30">%</span>
                            </div>
                            <p className="text-sm text-orange-400 mt-2 font-medium tracking-tight">Execution Rate</p>
                        </div>
                    </motion.div>

                    {/* Weekly Strategy List */}
                    <motion.div variants={fadeInUp} className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[32px] p-6 sm:p-8 flex flex-col justify-center">
                        <h3 className="text-[13px] font-semibold tracking-widest text-white/40 mb-6 uppercase">Weekly Strategy</h3>
                        
                        {analyticsLoading ? (
                            <div className="space-y-6 animate-pulse">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="flex items-center justify-between py-1">
                                        <div className="h-4 bg-white/10 rounded w-1/3" />
                                        <div className="h-4 bg-white/10 rounded w-1/4" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between pb-5 border-b border-white/[0.04]">
                                    <span className="text-[15px] font-medium text-white/60">Most Neglected</span>
                                    <span className="text-[15px] font-semibold tracking-tight text-white">{analytics?.strategy?.neglectedGoal || 'None'}</span>
                                </div>
                                <div className="flex items-center justify-between pb-5 border-b border-white/[0.04]">
                                    <span className="text-[15px] font-medium text-white/60">Most Protected</span>
                                    <span className="text-[15px] font-semibold tracking-tight text-white">{analytics?.strategy?.protectedGoal || 'None'}</span>
                                </div>
                                <div className="flex items-center justify-between pb-5 border-b border-white/[0.04]">
                                    <span className="text-[15px] font-medium text-white/60">Bottleneck</span>
                                    <span className="text-[15px] font-semibold tracking-tight text-amber-500">{analytics?.strategy?.bottleneck || 'None'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[15px] font-medium text-white/60">Suggested Focus</span>
                                    <span className="text-[15px] font-semibold tracking-tight text-orange-400">{analytics?.strategy?.recommendedFocus || 'Mind'}</span>
                                </div>
                            </div>
                        )}
                    </motion.div>

                    {/* Recent Decisions */}
                    <motion.div variants={fadeInUp} className="bg-[#1c1c1e]/40 backdrop-blur-3xl border border-white/[0.06] rounded-[32px] p-6 sm:p-8">
                        <h3 className="text-[13px] font-semibold tracking-widest text-white/40 mb-6 uppercase">Recent Decisions</h3>
                        <div className="space-y-3">
                            {analyticsLoading ? (
                                [1, 2, 3].map(i => (
                                    <div key={i} className="p-4 rounded-[20px] bg-white/[0.02] border border-white/[0.04] flex items-center gap-4 animate-pulse">
                                        <div className="w-10 h-10 rounded-[12px] bg-white/[0.04] shrink-0" />
                                        <div className="flex flex-col space-y-2 w-full">
                                            <div className="h-4 bg-white/10 rounded w-1/2" />
                                            <div className="h-3 bg-white/10 rounded w-1/3" />
                                        </div>
                                    </div>
                                ))
                            ) : analytics?.recentDecisions && analytics.recentDecisions.length > 0 ? (
                                analytics.recentDecisions.map((decision, idx) => (
                                    <div key={idx} className="group p-4 rounded-[20px] bg-white/[0.02] border border-white/[0.04] flex items-center gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                        <div className="w-10 h-10 rounded-[12px] bg-white/[0.03] flex items-center justify-center shrink-0 border border-white/[0.04] group-hover:border-orange-500/30 group-hover:bg-orange-500/10 transition-colors">
                                            <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-orange-400 transition-colors" />
                                        </div>
                                        <div className="flex flex-col">
                                            <h4 className="text-[15px] font-semibold text-white/90 tracking-tight">{decision.title}</h4>
                                            <p className="text-[13px] font-medium text-white/40 mt-0.5">
                                                {new Date(decision.timestamp).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-48 flex flex-col items-center justify-center text-center rounded-[24px] bg-white/[0.02] border border-white/[0.04]">
                                    <Sparkles className="w-8 h-8 text-white/20 mb-3" />
                                    <p className="text-white/60 font-medium tracking-tight text-sm">No Decisions Yet</p>
                                    <p className="text-white/30 text-[13px] mt-1 max-w-[200px]">Interact with Donna to see history.</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            <div className="h-20" />
        </div>
    );
}
