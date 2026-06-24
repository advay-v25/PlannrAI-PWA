'use client';

import React from 'react';
import { useScroll, useTransform, motion } from 'framer-motion';

function InteractiveGlobe() {
  return (
    <div className="w-full h-full flex items-center justify-center relative">
      {/* Globe removed for now */}
      {/* Atmosphere Glow */}
      <div className="absolute inset-0 rounded-full shadow-[0_0_80px_rgba(168,85,247,0.15)] pointer-events-none" />
    </div>
  );
}

export function SciFiEarthBackground() {
  // Hook for scroll-driven animations
  const { scrollY } = useScroll();
  const beamOpacity = useTransform(scrollY, [0, 400], [0.6, 0.05]);

  return (
    <div className="fixed inset-0 w-full h-full z-[-1] bg-[#020106] overflow-hidden" style={{ willChange: 'transform' }}>
      {/* Deep space background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,10,35,0.8)_0%,rgba(2,1,6,1)_100%)] pointer-events-none" />
      
      {/* Drifting Nebulas - Removed mix-blend-screen and complex arrays to drastically improve GPU rasterization */}
      <motion.div 
        className="absolute -top-1/4 -left-1/4 w-[120vw] h-[120vh] pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 30% 50%, rgba(217,4,121,0.12) 0%, rgba(147,51,234,0.06) 30%, transparent 60%)',
          willChange: 'transform, opacity'
        }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div 
        className="absolute top-1/4 -right-1/4 w-[120vw] h-[120vh] pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 70% 40%, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.06) 30%, transparent 60%)',
          willChange: 'transform, opacity'
        }}
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* Hyper-realistic Deep Space Nebula Background */}
      <motion.div 
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
        style={{
          backgroundImage: 'url(/assets/space-nebula-bg.png)',
          backgroundSize: '1024px 1024px',
          willChange: 'background-position'
        }}
        animate={{ backgroundPosition: ['0px 0px', '1024px 1024px'] }}
        transition={{ repeat: Infinity, duration: 240, ease: 'linear' }}
      />
      
      {/* Majestic Light Beam with Scroll Fade */}
      <motion.div 
        className="absolute left-1/2 top-0 bottom-0 w-[600px] -translate-x-1/2 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(147,51,234,0.1) 30%, rgba(236,72,153,0.15) 50%, rgba(147,51,234,0.1) 70%, transparent 100%)',
          opacity: beamOpacity,
          willChange: 'opacity'
        }}
      />
      
      {/* Interactive WebGL Globe */}
      {/* Removed scroll-linked scale/y transforms on the WebGL container. Transforming a WebGL context during scroll destroys frame rates. */}
      <div className="absolute top-[15%] md:top-[12%] left-1/2 -translate-x-1/2 w-[160vw] h-[160vw] max-w-[1200px] max-h-[1200px] sm:w-[110vw] sm:h-[110vw] md:w-[1000px] md:h-[1000px] lg:w-[1100px] lg:h-[1100px] opacity-70">
        
        {/* Outer Atmospheric Glow */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.15)_0%,transparent_70%)] pointer-events-none" />
        <div className="absolute inset-10 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.1)_0%,transparent_60%)] pointer-events-none" />
        
        {/* Globe Container */}
        <div className="relative w-full h-full flex items-center justify-center">
          <InteractiveGlobe />
        </div>
      </div>
      
      {/* Subtle Vignette for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020106_100%)] opacity-70 pointer-events-none" />
      {/* Bottom gradient mask specifically for text contrast across the page */}
      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#020106] via-[#020106]/70 to-transparent pointer-events-none" />
    </div>
  );
}
