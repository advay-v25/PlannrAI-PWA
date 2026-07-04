import { cn } from '@/lib/utils';
import { LoadingTimeout } from './loading-timeout';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'button' | 'avatar' | 'input';
  lines?: number;
}

const variants = {
  text: 'h-4 bg-[var(--glass-bg)] rounded',
  card: 'rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)]',
  button: 'h-10 bg-[var(--glass-bg)] rounded-lg',
  avatar: 'rounded-full bg-[var(--glass-bg)]',
  input: 'h-12 bg-[var(--glass-bg)] rounded-2xl border border-[var(--glass-border)]',
};

export function Skeleton({ className, variant = 'text', lines = 1 }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <LoadingTimeout>
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'animate-scifi-sweep',
                variants[variant],
                i === lines - 1 && 'w-3/4',
                className
              )}
            />
          ))}
        </div>
      </LoadingTimeout>
    );
  }

  return (
    <LoadingTimeout>
      <div
        className={cn(
          'animate-scifi-sweep',
          variants[variant],
          className
        )}
      />
    </LoadingTimeout>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <LoadingTimeout>
      <div className={cn(
        'glass-card animate-scifi-sweep',
        'p-6 space-y-4',
        className
      )}>
        <Skeleton variant="text" className="w-3/4" />
        <Skeleton variant="text" lines={3} />
        <div className="flex gap-2">
          <Skeleton variant="button" className="flex-1" />
          <Skeleton variant="button" className="flex-1" />
        </div>
      </div>
    </LoadingTimeout>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <LoadingTimeout>
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </LoadingTimeout>
  );
}
