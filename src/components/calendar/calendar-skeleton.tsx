import { cn } from '@/lib/utils';
import { PageBackground } from '@/components/ui/PageBackground';
import { LoadingTimeout } from '@/components/ui/loading-timeout';

export function CalendarSkeleton() {
    return (
        <LoadingTimeout>
            <div className="h-screen bg-[var(--color-bg-primary)] overflow-hidden flex flex-col">
                <PageBackground color="teal" variant="horizon" intensity="subtle" />
                
                {/* Top Header Skeleton */}
                <div className="shrink-0 px-6 py-3 border-b border-[var(--glass-border)] bg-[var(--color-bg-secondary)] dark:bg-black/80 backdrop-blur-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                            <div className="w-16 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                            <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                        </div>
                        <div className="w-40 h-5 rounded skeleton-shimmer bg-[var(--glass-bg)]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-24 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                        <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                        <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                        <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-[var(--glass-bg)]" />
                    </div>
                </div>

                {/* Main Content Skeleton */}
                <div className="flex flex-1 overflow-hidden relative">
                    {/* Weekly progress bar skeleton */}
                    <div className="hidden lg:flex flex-col items-center gap-3 w-11 shrink-0 border-r border-[var(--glass-border)] py-8">
                        <div className="w-4 h-8 skeleton-shimmer bg-[var(--glass-bg)] rounded" />
                        <div className="flex-1 w-1.5 bg-[var(--glass-bg)] rounded-full skeleton-shimmer" />
                    </div>

                    {/* Grid Skeleton */}
                    <div className="flex-1 p-4 grid grid-cols-7 gap-4">
                        {Array.from({ length: 7 }).map((_, i) => (
                            <div key={i} className="flex flex-col gap-4 border-r border-dashed border-white/[0.02] last:border-0 pr-4">
                                <div className="w-8 h-8 rounded-full skeleton-shimmer bg-[var(--glass-bg)] mx-auto" />
                                <div className="flex-1 flex flex-col gap-3 mt-4">
                                    <div className="h-24 rounded-xl skeleton-shimmer bg-[var(--glass-bg)]" />
                                    <div className="h-32 rounded-xl skeleton-shimmer bg-[var(--glass-bg)] mt-8" />
                                    <div className="h-16 rounded-xl skeleton-shimmer bg-[var(--glass-bg)] mt-4" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </LoadingTimeout>
    );
}
