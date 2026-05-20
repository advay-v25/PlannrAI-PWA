import { cn } from '@/lib/utils';
import { PageBackground } from '@/components/ui/PageBackground';

export function CalendarSkeleton() {
    return (
        <div className="h-screen bg-black overflow-hidden flex flex-col">
            <PageBackground color="teal" variant="horizon" intensity="subtle" />
            
            {/* Top Header Skeleton */}
            <div className="shrink-0 px-6 py-3 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                        <div className="w-16 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                        <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                    </div>
                    <div className="w-40 h-5 rounded skeleton-shimmer bg-white/[0.03]" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-24 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                    <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                    <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                    <div className="w-8 h-8 rounded-lg skeleton-shimmer bg-white/[0.03]" />
                </div>
            </div>

            {/* Main Content Skeleton */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Weekly progress bar skeleton */}
                <div className="hidden lg:flex flex-col items-center gap-3 w-11 shrink-0 border-r border-white/[0.04] py-8">
                    <div className="w-4 h-8 skeleton-shimmer bg-white/[0.03] rounded" />
                    <div className="flex-1 w-1.5 bg-white/[0.03] rounded-full skeleton-shimmer" />
                </div>

                {/* Grid Skeleton */}
                <div className="flex-1 p-4 grid grid-cols-7 gap-4">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-4 border-r border-dashed border-white/[0.02] last:border-0 pr-4">
                            <div className="w-8 h-8 rounded-full skeleton-shimmer bg-white/[0.03] mx-auto" />
                            <div className="flex-1 flex flex-col gap-3 mt-4">
                                <div className="h-24 rounded-xl skeleton-shimmer bg-white/[0.02]" />
                                <div className="h-32 rounded-xl skeleton-shimmer bg-white/[0.02] mt-8" />
                                <div className="h-16 rounded-xl skeleton-shimmer bg-white/[0.02] mt-4" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
