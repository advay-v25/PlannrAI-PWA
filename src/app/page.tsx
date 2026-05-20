import Link from 'next/link';
import { Sparkles, ArrowRight, Shield, Heart, Brain, Target, Calendar, BarChart3, Zap } from 'lucide-react';
import { PageBackground } from '@/components/ui/PageBackground';
import { LiquidGlassButton } from '@/components/ui/liquid-glass-button';

export default function LandingPage() {
  return (
    <div className="min-h-screen relative font-sans text-white overflow-x-hidden">
      {/* 3D Atmospheric Background */}
      <div className="fixed inset-0 w-full h-full -z-20 bg-[#030108]">
        {/* Deep, dynamic cinematic lighting */}
        <div className="absolute inset-0 opacity-80 mix-blend-screen pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.4)_0%,transparent_60%)] filter blur-[100px] animate-pb-blob-float" style={{ animationDuration: '20s' }} />
          <div className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-[radial-gradient(ellipse_at_center,rgba(217,4,121,0.3)_0%,transparent_60%)] filter blur-[120px] animate-pb-blob-float" style={{ animationDuration: '25s', animationDirection: 'reverse' }} />
          <div className="absolute top-[20%] right-[10%] w-[40vw] h-[40vw] bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.2)_0%,transparent_60%)] filter blur-[90px] animate-pulse-glow" style={{ animationDuration: '8s' }} />
        </div>
        
        {/* Chromatic aberration & noise overlay for premium digital texture */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%221.5%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-32 overflow-hidden flex flex-col items-center justify-center min-h-[90vh]">
        <div className="max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
          {/* Central 3D Logo Element */}
          <div className="relative inline-flex items-center justify-center w-28 h-28 mb-10 group">
            {/* Pulsing aura */}
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-600 via-pink-600 to-orange-500 rounded-3xl blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-700 animate-pulse-glow" />
            
            {/* Glass core */}
            <div className="relative w-full h-full rounded-3xl bg-black/40 backdrop-blur-2xl border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-center transform transition-transform duration-500 hover:scale-110 hover:rotate-3">
              <Sparkles className="w-12 h-12 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
              {/* Refraction highlight */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-3xl opacity-50" />
            </div>
            
            {/* Sci-fi indicator */}
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.8)] animate-scifi-blink" />
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-pink-300 to-amber-200 drop-shadow-[0_0_30px_rgba(217,4,121,0.4)]">
              PlannrAI
            </span>
          </h1>

          <p className="text-2xl md:text-3xl text-white/90 font-medium mb-6 max-w-2xl mx-auto drop-shadow-md">
            Build how you want to, adapt when you need to.
          </p>

          <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto leading-relaxed">
            Absorb mental chaos. See what matters today. Adapt to low-energy days.
            Protect your long-term goals without pressure or judgment.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center w-full max-w-md">
            <LiquidGlassButton href="/login" size="lg" className="w-full">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </LiquidGlassButton>
          </div>
        </div>
        
        {/* Subtle scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce flex flex-col items-center text-white/30">
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold mb-2">Discover</span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* Core Promise - Premium Banner */}
      <section className="relative px-4 py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900/40 via-pink-900/30 to-orange-900/30 backdrop-blur-xl border-y border-white/10" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <p className="text-3xl md:text-4xl font-light leading-snug tracking-tight text-white/90 italic">
            <span className="text-pink-400 font-serif mr-2">&ldquo;</span>
            I am not alone, I am not failing, and I can still move forward.
            <span className="text-pink-400 font-serif ml-2">&rdquo;</span>
          </p>
          <p className="mt-6 text-sm tracking-[0.2em] text-white/50 uppercase font-bold">
            What you should feel after every interaction
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="px-4 py-32 relative">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
              A Chief of Staff for Your Life
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              PlannrAI sees the full context, tracks reality honestly, anticipates friction,
              and suggests strategies — but never takes control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
      <section className="px-4 py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl border-t border-white/5" />
        <div className="max-w-5xl mx-auto relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-white/90">
            The Protocol
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <GuaranteeCard icon={<Shield />} text="Never shame or punish" />
            <GuaranteeCard icon={<Shield />} text="Never assume consistency" />
            <GuaranteeCard icon={<Shield />} text="Never act without permission" />
            <GuaranteeCard icon={<Zap />} text="Always offer a next best move" />
            <GuaranteeCard icon={<Heart />} text="Adapt to low-energy days" />
            <GuaranteeCard icon={<Sparkles />} text="Celebrate progress honestly" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-32 relative">
        {/* Glow behind CTA */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] bg-gradient-to-tr from-purple-600/20 to-orange-500/20 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-2xl mx-auto text-center relative z-10 p-10 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-2xl">
          <h2 className="text-4xl font-bold mb-6 text-white">
            Ready to feel supported?
          </h2>
          <p className="text-lg text-white/60 mb-10">
            No credit card. No complicated setup. Just an intelligent companion that has your back.
          </p>
          <div className="flex justify-center">
            <LiquidGlassButton href="/login" size="lg">
              Initialize PlannrAI
              <ArrowRight className="w-5 h-5 ml-2" />
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
    <div className="p-8 rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 hover:border-white/30 transition-all duration-500 relative overflow-hidden group hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
      {/* Dynamic gradient background on hover */}
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
      
      {/* Glass reflection */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Blinking micro-indicator */}
      <span className="absolute top-6 right-6 w-1.5 h-1.5 rounded-full bg-white/40 group-hover:bg-orange-500 animate-scifi-blink transition-colors" />
      
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br ${color} bg-opacity-20 shadow-inner relative z-10`}>
        <div className="absolute inset-0 bg-white/10 rounded-2xl" />
        <div className="text-white drop-shadow-md z-10">
          {icon}
        </div>
      </div>
      
      <h3 className="font-bold text-xl mb-3 text-white/90 relative z-10">{title}</h3>
      <p className="text-white/50 leading-relaxed relative z-10">{description}</p>
    </div>
  );
}

function GuaranteeCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/5 hover:border-white/15 hover:bg-white/[0.02] transition-colors group">
      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-white/70 group-hover:text-white group-hover:bg-white/10 transition-colors shadow-inner border border-white/5">
        {icon}
      </div>
      <span className="font-medium text-white/80 group-hover:text-white transition-colors">{text}</span>
    </div>
  );
}
