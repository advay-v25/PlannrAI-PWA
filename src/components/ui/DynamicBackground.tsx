'use client';

import React from 'react';
import { motion } from 'framer-motion';

type Variant = 'onboarding' | 'coach';

export function DynamicBackground({ variant }: { variant: Variant }) {
  if (variant === 'onboarding') {
    return (
      <div className="fixed inset-0 w-full h-full -z-20 overflow-hidden bg-[#030108] pointer-events-none">
        {/* Dynamic liquid morphing shapes */}
        <motion.div
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-screen filter blur-[80px]"
          style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)' }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen filter blur-[100px]"
          style={{ background: 'radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 70%)' }}
          animate={{
            scale: [1, 1.3, 1],
            x: [0, -40, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.div
          className="absolute top-[30%] left-[30%] w-[40vw] h-[40vw] rounded-full mix-blend-screen filter blur-[90px]"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)' }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%221.5%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')] opacity-[0.04] mix-blend-overlay pointer-events-none" />
      </div>
    );
  }

  // Coach Variant: Neural / Synaptic pulse
  return (
    <div className="fixed inset-0 w-full h-full -z-20 overflow-hidden bg-[#020104] pointer-events-none">
      {/* Central neural core glow */}
      <motion.div
        className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] rounded-full mix-blend-screen filter blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, rgba(217,4,121,0.05) 50%, transparent 80%)' }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* Side pulses (synapses) */}
      <motion.div
        className="absolute top-[20%] left-[-10%] w-[40vw] h-[40vw] rounded-full filter blur-[90px]"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)' }}
        animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        className="absolute top-[40%] right-[-10%] w-[35vw] h-[35vw] rounded-full filter blur-[80px]"
        style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%)' }}
        animate={{ opacity: [0.2, 0.6, 0.2], scale: [1, 1.2, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      
      {/* Data stream lines (simulated via sweeping gradients) */}
      <div className="absolute inset-0 opacity-20">
         <motion.div 
           className="absolute left-[20%] top-0 w-[1px] h-[200%] bg-gradient-to-b from-transparent via-orange-500 to-transparent"
           animate={{ y: ['-100%', '0%'] }}
           transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
         />
         <motion.div 
           className="absolute left-[50%] top-0 w-[1px] h-[200%] bg-gradient-to-b from-transparent via-purple-500 to-transparent"
           animate={{ y: ['-100%', '0%'] }}
           transition={{ duration: 20, repeat: Infinity, ease: 'linear', delay: 5 }}
         />
         <motion.div 
           className="absolute right-[25%] top-0 w-[1px] h-[200%] bg-gradient-to-b from-transparent via-pink-500 to-transparent"
           animate={{ y: ['-100%', '0%'] }}
           transition={{ duration: 18, repeat: Infinity, ease: 'linear', delay: 2 }}
         />
      </div>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%222%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
    </div>
  );
}
