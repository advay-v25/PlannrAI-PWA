'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format, parseISO, isValid } from 'date-fns';
import { Calendar, ChevronLeft, SearchX } from 'lucide-react';
import { PageBackground } from '@/components/ui/PageBackground';
import { apiClient } from '@/lib/api-client';

export default function HistoryDatePage() {
    const router = useRouter();
    const params = useParams();
    const dateParam = params?.date as string;
    
    const [loading, setLoading] = useState(true);
    const [hasData, setHasData] = useState(false);
    
    // Parse and validate date
    const parsedDate = dateParam ? parseISO(dateParam) : null;
    const isValidDate = parsedDate && isValid(parsedDate);
    const displayDate = isValidDate ? format(parsedDate, 'MMMM do, yyyy') : 'Unknown Date';

    useEffect(() => {
        if (!isValidDate) {
            setLoading(false);
            return;
        }

        // Attempt to fetch data for this specific date
        apiClient.get(`/api/home/summary?date=${dateParam}`)
            .then((res: any) => {
                if (res && res.schedule_blocks && res.schedule_blocks.length > 0) {
                    setHasData(true);
                }
            })
            .catch(() => {
                setHasData(false);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [dateParam, isValidDate]);

    if (loading) {
        return (
            <div className="flex-1 h-full flex flex-col items-center justify-center relative overflow-hidden">
                <PageBackground variant="aurora" intensity="strong" />
                <div className="w-12 h-12 border-[2px] border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!hasData || !isValidDate) {
        return (
            <div className="flex-1 h-full flex flex-col relative overflow-hidden">
                <PageBackground variant="aurora" intensity="strong" />
                
                <header className="h-16 flex items-center px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg-active)] dark:bg-black/20 backdrop-blur-md z-10">
                    <button
                        onClick={() => router.push('/app')}
                        className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span className="font-medium text-sm">Back to Dashboard</span>
                    </button>
                </header>

                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10">
                    <div className="w-24 h-24 mb-6 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.15)] relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/20 to-transparent rounded-full" />
                        <SearchX className="w-10 h-10 text-[var(--text-secondary)] relative z-10" />
                    </div>
                    
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-white mb-2 tracking-tight">
                        No Timeline Found
                    </h1>
                    <p className="text-[var(--text-secondary)] max-w-sm mx-auto mb-8 text-sm">
                        We couldn't find any historical data or schedule blocks for <span className="text-[var(--text-primary)] dark:text-white font-medium">{displayDate}</span>. The daily log may be empty or the date is out of bounds.
                    </p>

                    <button
                        onClick={() => router.push('/app')}
                        className="px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--text-primary)] dark:text-white font-bold rounded-xl transition-all shadow-[0_0_15px_var(--color-primary-glow)] flex items-center gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        Return to Today
                    </button>
                </div>
            </div>
        );
    }

    // In a full implementation, you would render the historical dashboard layout here.
    // For now, we redirect them back to home or show a placeholder.
    return (
        <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center">
            <PageBackground variant="aurora" intensity="strong" />
            <h1 className="text-2xl font-bold text-[var(--text-primary)] dark:text-white mb-4">Historical Data for {displayDate}</h1>
            <p className="text-[var(--text-secondary)] mb-6">Historical view is currently under construction.</p>
            <button
                onClick={() => router.push('/app')}
                className="px-6 py-3 bg-[var(--color-primary)] text-[var(--text-primary)] dark:text-white font-bold rounded-xl"
            >
                Return to Dashboard
            </button>
        </div>
    );
}
