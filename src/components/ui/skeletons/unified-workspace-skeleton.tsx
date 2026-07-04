import { motion } from 'framer-motion';
import { LoadingTimeout } from '../loading-timeout';

export function UnifiedWorkspaceSkeleton() {
    return (
        <LoadingTimeout>
            <div className="flex flex-col space-y-6 w-full p-6 animate-pulse">
                {/* Header Area */}
                <div className="flex justify-between items-start w-full gap-4">
                    <div className="flex flex-col space-y-3 w-1/2">
                        <div className="h-8 bg-[var(--glass-border)] rounded-lg w-2/3" />
                        <div className="h-4 bg-[var(--glass-border)]/50 rounded-md w-1/2" />
                    </div>
                    <div className="flex space-x-3">
                        <div className="h-10 w-10 bg-[var(--glass-border)] rounded-full" />
                        <div className="h-10 w-10 bg-[var(--glass-border)] rounded-full" />
                    </div>
                </div>

                {/* Dashboard Cards Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-32 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl flex flex-col p-4 justify-between">
                            <div className="h-4 bg-[var(--glass-border)] rounded-md w-1/3" />
                            <div className="h-8 bg-[var(--glass-border)] rounded-md w-1/2" />
                        </div>
                    ))}
                </div>

                {/* Main Content Areas */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full h-[500px]">
                    {/* Left Column - usually timeline / tasks */}
                    <div className="lg:col-span-2 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 flex flex-col space-y-4">
                        <div className="h-6 bg-[var(--glass-border)] rounded-md w-1/4 mb-4" />
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center space-x-4 w-full">
                                <div className="h-12 w-12 bg-[var(--glass-border)]/50 rounded-lg flex-shrink-0" />
                                <div className="flex flex-col space-y-2 flex-grow">
                                    <div className="h-4 bg-[var(--glass-border)] rounded-md w-3/4" />
                                    <div className="h-3 bg-[var(--glass-border)]/50 rounded-md w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Column - insights / sidebar */}
                    <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 flex flex-col space-y-4">
                        <div className="h-6 bg-[var(--glass-border)] rounded-md w-1/3 mb-4" />
                        <div className="h-40 bg-[var(--glass-border)]/50 rounded-xl w-full" />
                        <div className="h-40 bg-[var(--glass-border)]/50 rounded-xl w-full" />
                    </div>
                </div>
            </div>
        </LoadingTimeout>
    );
}
