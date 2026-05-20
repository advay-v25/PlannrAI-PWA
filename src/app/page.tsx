import Link from 'next/link';
import { Sparkles, ArrowRight, Shield, Heart, Brain, Target, Calendar, BarChart3 } from 'lucide-react';

function LandingBackground() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Animated orange sweep — left */}
      <div style={{
        position: 'absolute', left: '-8%', top: '-25%',
        width: '65vw', height: '80vh',
        background: 'radial-gradient(ellipse 65% 55% at 28% 30%, hsla(16, 100%, 58%, 0.30) 0%, hsla(16, 100%, 40%, 0.14) 45%, transparent 70%)',
        filter: 'blur(50px)',
        animation: 'pb-drift-1 22s ease-in-out infinite',
      }} />

      {/* Animated purple — centre */}
      <div style={{
        position: 'absolute', left: '25%', top: '-22%',
        width: '58vw', height: '72vh',
        background: 'radial-gradient(ellipse 62% 48% at 50% 32%, hsla(270, 85%, 62%, 0.24) 0%, hsla(270, 85%, 40%, 0.12) 48%, transparent 72%)',
        filter: 'blur(55px)',
        animation: 'pb-drift-2 28s ease-in-out infinite',
      }} />

      {/* Animated teal — right */}
      <div style={{
        position: 'absolute', right: '-10%', top: '-18%',
        width: '52vw', height: '65vh',
        background: 'radial-gradient(ellipse 58% 45% at 68% 28%, hsla(158, 80%, 48%, 0.20) 0%, hsla(158, 80%, 28%, 0.10) 50%, transparent 74%)',
        filter: 'blur(52px)',
        animation: 'pb-drift-3 20s ease-in-out infinite',
      }} />

      {/* Large rising arc from bottom — the hero visual anchor */}
      <div style={{
        position: 'absolute', bottom: '-35%', left: '-15%', right: '-15%',
        height: '90vh',
        background: 'radial-gradient(ellipse 80% 55% at 50% 100%, hsla(16, 100%, 55%, 0.20) 0%, hsla(270, 85%, 58%, 0.13) 35%, hsla(158, 80%, 45%, 0.07) 55%, transparent 70%)',
        filter: 'blur(65px)',
        animation: 'pb-arc-breathe 16s ease-in-out infinite',
      }} />

      {/* Thin top shimmer line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
        background: 'linear-gradient(to right, transparent 0%, hsla(16, 100%, 65%, 0.55) 20%, hsla(270, 85%, 68%, 0.55) 50%, hsla(158, 80%, 55%, 0.50) 80%, transparent 100%)',
        filter: 'blur(0.5px)',
      }} />

      {/* Fade to dark below fold */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
        background: 'linear-gradient(to bottom, transparent 0%, transparent 22%, var(--color-bg-primary) 58%)',
      }} />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingBackground />
      {/* Hero Section */}
      <section className="relative px-4 pt-20 pb-32 overflow-hidden">

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Logo */}
          <div className="animate-entry-rise inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--color-primary)]/20 mb-8 ring-1 ring-[var(--color-primary)]/20">
            <Sparkles className="w-10 h-10 text-[var(--color-primary)]" />
          </div>

          <h1 className="animate-entry-rise animate-entry-delay-1 text-4xl md:text-6xl font-bold mb-6">
            <span className="text-gradient">PlannrAI</span>
          </h1>

          <p className="animate-entry-rise animate-entry-delay-2 text-xl md:text-2xl text-[var(--color-text-secondary)] mb-4 max-w-2xl mx-auto">
            Build how you want to, adapt when you need to
          </p>

          <p className="animate-entry-rise animate-entry-delay-3 text-[var(--color-text-muted)] mb-8 max-w-xl mx-auto">
            Absorb mental chaos. See what matters today. Adapt to low-energy days.
            Protect your long-term goals without pressure or judgment.
          </p>

          <div className="animate-entry-rise animate-entry-delay-4 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-soft)] transition-colors shadow-lg shadow-[var(--color-primary)]/25"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] font-medium hover:bg-[var(--glass-bg-hover)] transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Core Promise */}
      <section className="px-4 py-16 bg-[var(--color-bg-secondary)]/50">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-2xl md:text-3xl font-medium leading-relaxed">
            <span className="text-[var(--color-primary)]">&ldquo;</span>
            I am not alone, I am not failing, and I can still move forward.
            <span className="text-[var(--color-primary)]">&rdquo;</span>
          </p>
          <p className="mt-4 text-[var(--color-text-muted)]">
            — What you should feel after every interaction
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            A Chief of Staff for Your Life
          </h2>
          <p className="text-center text-[var(--color-text-muted)] mb-12 max-w-xl mx-auto">
            PlannrAI sees the full context, tracks reality honestly, anticipates friction,
            and suggests strategies — but never takes control.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Brain className="w-6 h-6" />}
              title="Brain Dump"
              description="Clear mental clutter with unstructured dumps. No prompts, no structure — just relief."
              color="var(--color-accent-mind)"
            />
            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="Goal Tracking"
              description="Set time intentions for Mind, Body, and Future. Adjust anytime without guilt."
              color="var(--color-accent-body)"
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Reality Calendar"
              description="Track what actually happened, not just what you planned. Missed blocks fade quietly."
              color="var(--color-accent-future)"
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6" />}
              title="AI Coach"
              description="Get strategic advice with facts, interpretation, options, and always a permission check."
              color="var(--color-primary)"
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Weekly Review"
              description="See patterns and get one suggestion. Accept, edit, or ignore — all valid choices."
              color="var(--color-warning)"
            />
            <FeatureCard
              icon={<Heart className="w-6 h-6" />}
              title="Low Energy Mode"
              description="Signal when you're struggling. I'll reduce expectations and protect what matters."
              color="var(--color-success)"
            />
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="px-4 py-20 bg-[var(--color-bg-secondary)]/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            What I Promise
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <GuaranteeCard icon={<Shield />} text="Never shame or punish" />
            <GuaranteeCard icon={<Shield />} text="Never assume consistency" />
            <GuaranteeCard icon={<Shield />} text="Never act without permission" />
            <GuaranteeCard icon={<Shield />} text="Always offer a next best move" />
            <GuaranteeCard icon={<Shield />} text="Adapt to low-energy days" />
            <GuaranteeCard icon={<Shield />} text="Celebrate progress honestly" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to feel supported?
          </h2>
          <p className="text-[var(--color-text-muted)] mb-8">
            No credit card. No complicated setup. Just a companion that has your back.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-soft)] transition-colors"
          >
            Start Your Journey
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 border-t border-[var(--glass-border)] mt-12">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
              <span className="font-medium">PlannrAI</span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Your data is private. Always.
            </p>
          </div>
          
          <div className="flex gap-6 text-sm text-[var(--color-text-muted)]">
            <Link href="/legal/terms" className="hover:text-white transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/legal/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] transition-colors">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}

function GuaranteeCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
      <div className="text-[var(--color-success)]">{icon}</div>
      <span className="font-medium">{text}</span>
    </div>
  );
}
