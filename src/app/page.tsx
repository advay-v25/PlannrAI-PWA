import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, ArrowRight, Shield, Heart, Brain, Target, Calendar, BarChart3, Zap } from 'lucide-react';
import { SciFiEarthBackground } from '@/components/ui/SciFiEarthBackground';
import { OrbitalScheduleEngine } from '@/components/ui/orbital-schedule-engine';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';

export default function LandingPage() {
  return (
    <div className="min-h-screen relative font-sans text-white overflow-x-hidden selection:bg-purple-500/30">
      {/* Cinematic Sci-Fi Background */}
      <SciFiEarthBackground />

      {/* Hero Section */}
      <section className="relative px-4 pt-12 md:pt-16 pb-16 md:pb-28 overflow-hidden flex flex-col min-h-[100dvh]">
        <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 relative z-10">
          {/* Logo + tagline — above the solar system */}
          <header className="text-center shrink-0 mb-6 md:mb-8 mt-2 md:mt-0">
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold mb-3 md:mb-4 tracking-tighter leading-[1.1]">
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-white/30 drop-shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                PlannrAI
              </span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-white/75 font-medium max-w-2xl mx-auto tracking-tight">
              Build when you want, adapt when you need
            </p>
          </header>

          {/* Solar system centerpiece */}
          <div className="relative flex-1 flex items-center justify-center min-h-[250px] sm:min-h-[380px] md:min-h-[440px] z-20">
            <OrbitalScheduleEngine className="absolute w-[min(120vw,800px)] h-[min(120vw,800px)] md:w-[1000px] md:h-[1000px]" />
          </div>

          {/* Get Started — bottom CTA */}
          <div className="flex justify-center w-full max-w-md mx-auto shrink-0 mt-8 md:mt-20 relative z-30">
            <LiquidGlassButton href="/login" size="lg" className="w-full text-lg font-bold text-white tracking-wide">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2 opacity-90 transition-transform group-hover:translate-x-1" />
            </LiquidGlassButton>
          </div>
        </div>
        
        {/* Subtle scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center text-white/30 opacity-50 hover:opacity-100 transition-opacity">
          <span className="text-[10px] tracking-[0.3em] uppercase font-semibold mb-4">Discover</span>
          <div className="w-px h-16 bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>

      {/* Core Promise - Premium Banner */}
      <section className="relative px-4 py-16 md:py-32 overflow-hidden border-y border-white/[0.02] bg-white/[0.01]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent backdrop-blur-[2px]" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <p className="text-3xl md:text-5xl font-light leading-tight tracking-tight text-white/90">
            <span className="text-purple-400 font-serif mr-4 opacity-40">&ldquo;</span>
            I am not alone, I am not failing, and I can still move forward.
            <span className="text-purple-400 font-serif ml-4 opacity-40">&rdquo;</span>
          </p>
          <p className="mt-10 text-xs tracking-[0.3em] text-white/40 uppercase font-semibold">
            What you should feel after every interaction
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="px-4 py-16 md:py-32 relative">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
              A Chief of Staff for Your Life
            </h2>
            <p className="text-lg md:text-xl text-white/50 max-w-3xl mx-auto font-light leading-relaxed tracking-wide">
              PlannrAI sees the full context, tracks reality honestly, anticipates friction,
              and suggests strategies — but never takes control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="Command Center"
              description="A centralized inbox and mission control for your life. Quick capture tasks, track goals, and see your real-time progress."
              color="from-[var(--color-primary)] to-[var(--color-primary-soft)]"
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Reality Calendar"
              description="A fluid, drag-and-drop schedule that tracks what actually happens. Features auto-scheduling and real-time conflict resolution."
              color="from-[var(--color-mind)] to-[var(--color-mind-glow)]"
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6" />}
              title="AI Coach (Donna)"
              description="Your proactive Chief of Staff. Get strategic advice, context-aware suggestions, and conflict resolution without the guilt."
              color="from-[var(--color-body)] to-[var(--color-body-glow)]"
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Insights & Review"
              description="Outcome-based analytics and weekly reviews. See patterns, accept suggestions, and adapt your strategies effortlessly."
              color="from-[var(--color-craft)] to-[var(--color-craft-glow)]"
            />
            <FeatureCard
              icon={<Heart className="w-6 h-6" />}
              title="Pillar Balance"
              description="Monitor your Mind, Body, and Craft. Achieve harmony instead of just checking off endless productivity boxes."
              color="from-[var(--color-anchor)] to-[var(--color-anchor-glow)]"
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Adaptive Systems"
              description="Built on behavioral psychology. Signal low energy to instantly reduce expectations and protect your momentum."
              color="from-[var(--color-routine)] to-[var(--color-routine-glow)]"
            />
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="px-4 py-16 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-white/[0.01] backdrop-blur-3xl border-t border-white/[0.02]" />
        <div className="max-w-6xl mx-auto relative z-10">
          <h2 className="text-4xl md:text-5xl font-extrabold text-center mb-20 tracking-tighter text-white/90">
            The Protocol
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8">
            <GuaranteeCard icon={<Shield className="w-5 h-5" />} text="Never shame or punish" />
            <GuaranteeCard icon={<Shield className="w-5 h-5" />} text="Never assume consistency" />
            <GuaranteeCard icon={<Shield className="w-5 h-5" />} text="Never act without permission" />
            <GuaranteeCard icon={<Zap className="w-5 h-5" />} text="Always offer a next best move" />
            <GuaranteeCard icon={<Heart className="w-5 h-5" />} text="Adapt to low-energy days" />
            <GuaranteeCard icon={<Sparkles className="w-5 h-5" />} text="Celebrate progress honestly" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 md:py-40 relative">
        {/* Glow behind CTA - Removed expensive blur-[120px] filter in favor of hardware-friendly radial gradient */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] bg-[radial-gradient(circle,rgba(147,51,234,0.15)_0%,transparent_60%)] rounded-full pointer-events-none" />
        
        <div className="max-w-3xl mx-auto text-center relative z-10 p-12 md:p-16 rounded-[3rem] bg-white/[0.02] border border-white/[0.05] backdrop-blur-2xl shadow-2xl">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tighter text-white">
            Ready to feel supported?
          </h2>
          <p className="text-lg md:text-xl text-white/50 mb-10 font-light tracking-wide max-w-xl mx-auto">
            No credit card. No complicated setup. Just an intelligent companion that has your back.
          </p>
          <div className="flex justify-center">
            <LiquidGlassButton href="/login" size="lg" className="px-10 text-lg">
              Initialize PlannrAI
              <ArrowRight className="w-5 h-5 ml-2 opacity-70" />
            </LiquidGlassButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-10 border-t border-white/10 relative z-10 bg-black/40 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="PlannrAI" width={28} height={28} className="rounded-lg shrink-0" />
              <span className="font-bold tracking-wide text-white">PlannrAI</span>
            </div>
            <p className="text-sm text-white/40">
              Your data is private. Always.
            </p>
          </div>
          
          <div className="flex gap-8 text-sm text-white/40 font-medium">
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
    <div className="p-8 md:p-10 rounded-[2rem] bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all duration-500 relative overflow-hidden group">
      {/* Dynamic gradient background on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-700`} />
      
      {/* Glass reflection */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 bg-white/[0.05] border border-white/[0.05] group-hover:scale-110 transition-transform duration-500 relative z-10`}>
        <div className="text-white/80 group-hover:text-white drop-shadow-md z-10 transition-colors">
          {icon}
        </div>
      </div>
      
      <h3 className="font-semibold text-xl mb-3 text-white/90 tracking-wide relative z-10">{title}</h3>
      <p className="text-white/50 leading-relaxed font-light relative z-10">{description}</p>
    </div>
  );
}

function GuaranteeCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-5 p-6 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all duration-500 group">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.05] text-white/60 group-hover:text-white group-hover:bg-white/[0.1] transition-all duration-500 group-hover:scale-110 border border-white/[0.05] flex-shrink-0">
        {icon}
      </div>
      <span className="font-medium text-white/70 group-hover:text-white/90 transition-colors tracking-wide">{text}</span>
    </div>
  );
}
