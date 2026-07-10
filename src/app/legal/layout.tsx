import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh bg-[var(--color-bg-primary)] dark:bg-black text-[var(--text-primary)] dark:text-white selection:bg-orange-500/30">
      {/* Subtle background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-orange-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="border-b border-[var(--glass-border)] bg-[var(--color-bg-primary)]/50 dark:bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </nav>

      {/* Content Container */}
      <main className="relative max-w-3xl mx-auto px-4 py-16">
        <div className="p-6 sm:p-12 rounded-2xl bg-[#111111]/80 backdrop-blur-xl border border-[var(--glass-border)] shadow-2xl text-[var(--text-muted)]">
          {children}
        </div>
      </main>
    </div>
  );
}
