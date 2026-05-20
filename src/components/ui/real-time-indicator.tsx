import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface RealTimeIndicatorProps {
  className?: string;
  showCountdown?: boolean;
}

export function RealTimeIndicator({ className, showCountdown = true }: RealTimeIndicatorProps) {
  const [showIndicator, setShowIndicator] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    // Initialize last sync from localStorage if available
    const saved = localStorage.getItem('plannrai-last-sync');
    if (saved) {
      setLastSync(new Date(saved));
    }

    // Listen for sync events dispatched elsewhere in the app
    const handleSync = (event: CustomEvent) => {
      setShowIndicator(true);
      const now = new Date();
      setLastSync(now);
      localStorage.setItem('plannrai-last-sync', now.toISOString());
      
      // Hide after 3 seconds
      setTimeout(() => setShowIndicator(false), 3000);
    };

    document.addEventListener('plannrai-sync', handleSync as EventListener);

    // Start countdown timer (30 second refresh cycle)
    if (showCountdown) {
      const interval = setInterval(() => {
        if (lastSync) {
          const diff = Date.now() - lastSync.getTime();
          const secondsUntilNext = Math.max(0, 30 - Math.floor(diff / 1000));
          setCountdown(secondsUntilNext);
        }
      }, 1000);

      return () => {
        document.removeEventListener('plannrai-sync', handleSync as EventListener);
        clearInterval(interval);
      };
    }

    return () => document.removeEventListener('plannrai-sync', handleSync as EventListener);
  }, [lastSync, showCountdown]);

  if (!showCountdown && !showIndicator) return null;

  return (
    <div className={cn(
      "fixed top-20 right-6 z-50 glass-card p-2 transition-all",
      (showIndicator || showCountdown) ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
      className
    )}>
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-2 h-2 rounded-full",
          showIndicator ? "bg-[var(--color-success)] animate-pulse" : "bg-[var(--color-primary)] animate-scifi-blink"
        )} />
        <span className="text-xs text-[var(--text-secondary)]">
          {showIndicator 
            ? "Synced" 
            : countdown !== null 
              ? `Sync in ${countdown}s` 
              : "Live"
          }
        </span>
      </div>
    </div>
  );
}

export function useSyncFeedback() {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const startSync = () => {
    setSyncing(true);
    setSyncError(null);
  };

  const completeSync = () => {
    setSyncing(false);
    setSyncError(null);
    // Show success indicator
    const event = new CustomEvent('plannrai-sync', { detail: { type: 'success' } });
    document.dispatchEvent(event);
  };

  const failSync = (error: string) => {
    setSyncing(false);
    setSyncError(error);
    const event = new CustomEvent('plannrai-sync', { detail: { type: 'error', error } });
    document.dispatchEvent(event);
  };

  return {
    syncing,
    syncError,
    startSync,
    completeSync,
    failSync
  };
}
