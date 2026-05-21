import Link from 'next/link';
import { Sparkles, ArrowRight, Shield, Heart, Brain, Target, Calendar, BarChart3, Zap } from 'lucide-react';
import { SciFiEarthBackground } from '@/components/ui/SciFiEarthBackground';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';

export default function LandingPage() {
  return (
    <div className="min-h-screen relative font-sans text-white overflow-x-hidden selection:bg-purple-500/30">
      {/* Cinematic Sci-Fi Background */}
      <SciFiEarthBackground />

      {/* Hero Section */}
      <section className="relative px-4 pt-32 pb-32 overflow-hidden flex flex-col items-center justify-center min-h-[100vh]">
        <div className="max-w-5xl mx-auto text-center relative z-10 flex flex-col items-center mt-10 md:mt-0">
          {/* Central 3D Logo Element */}
          <div className="relative inline-flex items-center justify-center w-24 h-24 md:w-28 md:h-28 mb-12 group">
            {/* Pulsing aura */}
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/40 via-fuchsia-500/40 to-orange-500/40 rounded-[2rem] blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-700 animate-pulse-glow" />
            
            {/* Glass core */}
            <div className="relative w-full h-full rounded-[2rem] bg-white/[0.03] backdrop-blur-3xl border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.4)] flex items-center justify-center transform transition-all duration-700 hover:scale-105 hover:rotate-2">
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
              {/* Refraction highlight */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-[2rem] opacity-50" />
            </div>
            
            {/* Sci-fi indicator */}
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.8)] animate-pulse" />
          </div>

          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[7.5rem] font-extrabold mb-8 tracking-tighter leading-[1.1]">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-white/30 drop-shadow-[0_0_40px_rgba(255,255,255,0.1)]">
              PlannrAI
            </span>
          </h1>

          <p className="text-2xl md:text-4xl text-white/80 font-medium mb-8 max-w-3xl mx-auto tracking-tight">
            Build how you want to, adapt when you need to.
          </p>

          <p className="text-lg md:text-xl text-white/50 mb-12 max-w-2xl mx-auto leading-relaxed tracking-wide font-light">
            Absorb mental chaos. See what matters today. Adapt to low-energy days.
            Protect your long-term goals without pressure or judgment.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center w-full max-w-md">
            <LiquidGlassButton href="/login" size="lg" className="w-full text-lg tracking-wide">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2 opacity-70 group-hover:translate-x-1 transition-transform" />
            </LiquidGlassButton>
          </div>
        </div>
        
        {/* Subtle scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center text-white/30 opacity-50 hover:opacity-100 transition-opacity">
          <span className="text-[10px] tracking-[0.3em] uppercase font-semibold mb-4">Discover</span>
          <div className="w-px h-16 bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>

      {/* Core Promise - Premium Banner */}
      <section className="relative px-4 py-32 overflow-hidden border-y border-white/[0.02] bg-white/[0.01]">
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
      <section id="features" className="px-4 py-32 relative">
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

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <FeatureCard
              icon={<Brain className="w-6 h-6" />}
              title="Brain Dump"
              description="Clear mental clutter with unstructured dumps. No prompts, no structure — just relief."
              color="from-purple-500 to-indigo-500"
            />
            <FeatureCard
              icon={<Target className="w-6 h-6" />}
              title="Goal Tracking"
              description="Set time intentions for Mind, Body, and Future. Adjust anytime without guilt."
              color="from-pink-500 to-rose-500"
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Reality Calendar"
              description="Track what actually happened, not just what you planned. Missed blocks fade quietly."
              color="from-orange-400 to-amber-500"
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6" />}
              title="AI Coach"
              description="Get strategic advice with facts, interpretation, options, and always a permission check."
              color="from-fuchsia-500 to-purple-500"
            />
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6" />}
              title="Weekly Review"
              description="See patterns and get one suggestion. Accept, edit, or ignore — all valid choices."
              color="from-emerald-400 to-teal-500"
            />
            <FeatureCard
              icon={<Heart className="w-6 h-6" />}
              title="Low Energy Mode"
              description="Signal when you're struggling. I'll reduce expectations and protect what matters."
              color="from-red-400 to-pink-500"
            />
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="px-4 py-32 relative overflow-hidden">
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
      <section className="px-4 py-40 relative">
        {/* Glow behind CTA */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] bg-gradient-to-tr from-purple-600/10 to-orange-500/10 rounded-full blur-[120px] pointer-events-none" />
        
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
              <Sparkles className="w-5 h-5 text-orange-400" />
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
