export function timeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
}

export function minutesToTime(totalMinutes: number): string {
    // Handle overflow/underflow around midnight
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function generateDateString(date: Date): string {
    return date.toISOString().split('T')[0];
}
