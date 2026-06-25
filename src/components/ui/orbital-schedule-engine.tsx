'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Sparkles, Calendar, Activity, Target, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OrbitalScheduleEngine({ className }: { className?: string }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Premium nodes inspired by Stitch generation
    const nodes = [
        { Icon: Compass, label: 'Coach', ring: 0, angle: 30 },
        { Icon: Target, label: 'Focus', ring: 0, angle: 150 },
        { Icon: Lock, label: 'Anchor', ring: 1, angle: 80 },
        { Icon: Activity, label: 'Body', ring: 1, angle: 260 },
        { Icon: Calendar, label: 'Craft', ring: 2, angle: 210 },
    ];

    // Massive, space-scale rings
    const rings = [
        { size: 500, speed: 60, border: 'border-white/5 border-[1px]' },
        { size: 750, speed: -90, border: 'border-white/5 border-[1px]' },
        { size: 1000, speed: 120, border: 'border-white/5 border-[1px]' },
    ];

    if (!mounted) return <div className={cn("relative w-full aspect-square", className)} />;

    return (
        <div className={cn("relative w-full aspect-square flex items-center justify-center pointer-events-none", className)}>
            <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '1200px' }}>
                
                {/* Massive Ambient Nebula Bloom */}
                <div className="absolute w-[1000px] h-[1000px] rounded-full bg-purple-600/10 mix-blend-screen blur-[120px] pointer-events-none" />

                {/* 3D Rotated Plane */}
                <motion.div 
                    className="relative w-full h-full flex items-center justify-center pointer-events-auto"
                    animate={{ rotateX: 60, rotateZ: -10 }}
                    transition={{ duration: 0 }}
                    style={{ transformStyle: 'preserve-3d' }}
                >

                    {/* Massive Orbital Tracks with Comet Tails */}
                    {rings.map((ring, idx) => (
                        <motion.div
                            key={`ring-${idx}`}
                            className={cn("absolute rounded-full", ring.border)}
                            style={{ 
                                width: ring.size, 
                                height: ring.size,
                                transformStyle: 'preserve-3d',
                            }}
                            animate={{ rotateZ: 360 * (ring.speed > 0 ? 1 : -1) }}
                            transition={{ duration: Math.abs(ring.speed), repeat: Infinity, ease: 'linear' }}
                        >
                            {/* Soft Comet Tail */}
                            <div className="absolute inset-0 rounded-full border-[1.5px] border-purple-400 shadow-[0_0_15px_#a855f7]" style={{
                                maskImage: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, black 100%)',
                                WebkitMaskImage: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, black 100%)'
                            }} />
                            {/* Bright Comet Head */}
                            <div className="absolute top-[-2px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] bg-white rounded-full shadow-[0_0_15px_3px_#d8b4fe]" />
                        </motion.div>
                    ))}

                    {/* Orbiting Nodes (Premium Glassmorphism & Revolving) */}
                    {nodes.map((node, i) => {
                        const ring = rings[node.ring];
                        const radius = ring.size / 2;
                        const dir = ring.speed > 0 ? 1 : -1;
                        const duration = Math.abs(ring.speed);

                        return (
                            <div 
                                key={`node-wrapper-${i}`} 
                                className="absolute inset-0 pointer-events-none" 
                                style={{ transform: `rotateZ(${node.angle}deg)`, transformStyle: 'preserve-3d' }}
                            >
                                <motion.div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{ transformStyle: 'preserve-3d' }}
                                    animate={{ rotateZ: [0, 360 * dir] }}
                                    transition={{ duration: duration, repeat: Infinity, ease: 'linear' }}
                                >
                                    <div
                                        className="absolute w-20 h-20 -ml-10 -mt-10 flex items-center justify-center z-20 pointer-events-auto"
                                        style={{
                                            left: `calc(50% + ${radius}px)`,
                                            top: '50%',
                                            transformStyle: 'preserve-3d'
                                        }}
                                    >
                                        <motion.div
                                            className="absolute inset-0 flex items-center justify-center"
                                            style={{ transformStyle: 'preserve-3d' }}
                                            animate={{ rotateZ: [-node.angle + 10, (-360 * dir) - node.angle + 10] }}
                                            transition={{ duration: duration, repeat: Infinity, ease: 'linear' }}
                                        >
                                            <motion.div
                                                className="w-full h-full border border-white/20 rounded-full bg-white/[0.05] backdrop-blur-xl flex items-center justify-center group cursor-pointer transition-colors hover:bg-white/[0.1] hover:border-white/40"
                                                style={{
                                                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.4)'
                                                }}
                                                initial={{ rotateX: -60 }}
                                                animate={{ rotateX: -60 }}
                                                whileHover={{ 
                                                    scale: 1.15, 
                                                    rotateX: -60,
                                                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.2), 0 15px 40px rgba(0,0,0,0.6), inset 0 0 20px rgba(255,255,255,0.1)' 
                                                }}
                                            >
                                                <node.Icon className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" strokeWidth={1.5} />
                                                
                                                {/* Tooltip */}
                                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/80 backdrop-blur-md text-white text-sm font-medium tracking-wide px-4 py-2 rounded-full border border-white/10 pointer-events-none whitespace-nowrap shadow-xl">
                                                    {node.label}
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    </div>
                                </motion.div>
                            </div>
                        );
                    })}

                </motion.div>
                
                {/* Deep Indigo Energy Core */}
                <div 
                    className="absolute rounded-full flex items-center justify-center z-30"
                    style={{ 
                        width: 140, 
                        height: 140,
                    }}
                >
                    {/* The Indigo Star Core */}
                    <motion.div 
                        className="absolute inset-0 rounded-full"
                        style={{
                            background: 'radial-gradient(circle at 40% 40%, #7c3aed 0%, #4c1d95 50%, #2e1065 100%)',
                            boxShadow: `
                                0 0 60px 20px rgba(139, 92, 246, 0.7),
                                0 0 150px 60px rgba(88, 28, 135, 0.5),
                                inset 0 0 20px rgba(255, 255, 255, 0.3)
                            `
                        }}
                        animate={{ scale: [1, 1.02, 1], opacity: [0.95, 1, 0.95] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* AI Spark (PlannrAI Logo) */}
                    <Sparkles className="w-12 h-12 text-white/90 z-40" strokeWidth={1.5} style={{ filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.8))' }} />
                </div>
            </div>
        </div>
    );
}
