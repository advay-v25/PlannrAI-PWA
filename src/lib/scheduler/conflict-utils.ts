
export const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

export const getConflicts = (newBlock: any, existingBlocks: any[]) => {
    const newStart = toMins(newBlock.start_time);
    const newEnd = toMins(newBlock.end_time);

    return existingBlocks.filter((b: any) => {
        // Exclude self if updating
        if (b.id === newBlock.id) return false;

        const start = toMins(b.start_time);
        const end = toMins(b.end_time);

        // Basic Overlap: (StartA < EndB) and (EndA > StartB)
        return (newStart < end && newEnd > start);
    });
};
