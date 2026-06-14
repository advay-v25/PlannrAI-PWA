import React from 'react';
import { Sparkles } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  subtitle: string;
}

export function ComingSoon({ title, subtitle }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
      <div className="h-16 w-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-4 border border-orange-500/20">
        <Sparkles className="w-8 h-8 text-orange-500" />
      </div>
      <h2 className="text-3xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="text-white/50 max-w-md">{subtitle}</p>
    </div>
  );
}
