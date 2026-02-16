
export function TimelineStrip({ blocks, anchors }: any) {
    // Merge and sort
    const allItems = [...(blocks || []), ...(anchors || []).map((a: any) => ({ ...a, type: 'anchor' }))];
    allItems.sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Simple time to percent mapper (06:00 to 24:00)
    const getLeft = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        const mins = (h * 60) + m;
        const startMins = 6 * 60; // 6am
        const totalMins = 18 * 60; // 18 hours view
        const p = ((mins - startMins) / totalMins) * 100;
        return Math.max(0, Math.min(100, p));
    };

    const getWidth = (start: string, end: string) => {
        const l = getLeft(start);
        const r = getLeft(end);
        return Math.max(1, r - l);
    };

    return (
        <div className="h-16 w-full bg-[var(--glass-surface)] rounded-xl relative overflow-hidden flex items-center px-0 border border-[var(--glass-border)]">
            {/* Base Line */}
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/5" />

            {/* Hour markers ? Optional */}

            {allItems.map((block: any, i: number) => (
                <div
                    key={block.id || i}
                    className={`absolute top-2 bottom-2 rounded-sm border border-black/20
                        ${block.type === 'anchor' ? 'bg-zinc-800' : 'bg-[var(--color-primary)]/20 border-[var(--color-primary)]/50'}
                    `}
                    style={{
                        left: `${getLeft(block.start_time)}%`,
                        width: `${getWidth(block.start_time, block.end_time)}%`
                    }}
                >
                </div>
            ))}

            {/* Current Time Indicator logic could go here */}
        </div>
    );
}
