import React from 'react';

export function SimpleGlobe() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Outer Glow */}
      <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-3xl animate-pulse" />
      
      {/* Globe Core */}
      <div className="relative w-full max-w-[500px] aspect-square rounded-full border border-purple-500/30 overflow-hidden shadow-[inset_0_0_50px_rgba(168,85,247,0.5),0_0_50px_rgba(168,85,247,0.2)] bg-black/40 backdrop-blur-sm">
        
        {/* Grid / Continents approximation (CSS pattern) */}
        <div 
          className="absolute inset-0 opacity-30 animate-spin-slow" 
          style={{
            backgroundImage: 'radial-gradient(circle at center, rgba(168,85,247,0.8) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            animationDuration: '60s'
          }}
        />
        
        {/* Curved inner shadow for 3D sphere effect */}
        <div className="absolute inset-0 rounded-full shadow-[inset_-40px_-40px_80px_rgba(0,0,0,0.9),inset_20px_20px_60px_rgba(255,255,255,0.1)] pointer-events-none" />
        
      </div>
    </div>
  );
}
