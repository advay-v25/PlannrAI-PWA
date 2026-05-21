'use client';

import React, { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, MotionValue } from 'framer-motion';
import dynamic from 'next/dynamic';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

function InteractiveGlobe({ scrollRotation }: { scrollRotation: MotionValue<number> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 800 });
  const globeRef = useRef<any>();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.2;
      controls.enableZoom = false;
      controls.enablePan = false;
    }
  }, [dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing">
      {dimensions.width > 0 && (
        <div style={{ width: '100%', height: '100%', filter: 'brightness(0.8) contrast(1.2)' }}>
          <Globe
            ref={globeRef}
            width={dimensions.width}
            height={dimensions.height}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundColor="rgba(0,0,0,0)"
            showAtmosphere={true}
            atmosphereColor="#3b82f6"
            atmosphereAltitude={0.15}
          />
        </div>
      )}
    </div>
  );
}

export function SciFiEarthBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Hook for scroll-driven animations
  const { scrollY } = useScroll();
  const earthScale = useTransform(scrollY, [0, 800], [1, 0.85]);
  const earthY = useTransform(scrollY, [0, 800], ['0%', '-30%']);
  const earthOpacity = useTransform(scrollY, [0, 800], [1, 0.3]);
  
  const scrollRotation = useTransform(scrollY, [0, 1000], [0, Math.PI / 2]);
  
  const beamOpacity = useTransform(scrollY, [0, 400], [0.8, 0.1]);
  const starsY = useTransform(scrollY, [0, 1000], [0, -200]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', resize);
    resize();

    // Stars
    const stars = Array.from({ length: 300 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5,
      speed: Math.random() * 0.2 + 0.05,
      opacity: Math.random(),
      fadeSpeed: (Math.random() * 0.02) + 0.005,
      fadingOut: Math.random() > 0.5,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Draw stars
      stars.forEach(star => {
        // Twinkle
        if (star.fadingOut) {
          star.opacity -= star.fadeSpeed;
          if (star.opacity <= 0) star.fadingOut = false;
        } else {
          star.opacity += star.fadeSpeed;
          if (star.opacity >= 1) star.fadingOut = true;
        }

        // Move
        star.y -= star.speed;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, star.opacity)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full z-[-1] bg-[#020106] overflow-hidden">
      {/* Deep space background with animated Nebula */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,10,35,0.8)_0%,rgba(2,1,6,1)_100%)] pointer-events-none" />
      
      {/* Drifting Nebulas */}
      <motion.div 
        className="absolute -top-1/4 -left-1/4 w-[120vw] h-[120vh] mix-blend-screen pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 30% 50%, rgba(217,4,121,0.1) 0%, rgba(147,51,234,0.05) 30%, transparent 60%)',
          filter: 'blur(100px)'
        }}
        animate={{ 
            x: ['-5%', '5%', '-5%'], 
            y: ['-5%', '5%', '-5%'],
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.1, 1]
        }}
        transition={{ duration: 45, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div 
        className="absolute top-1/4 -right-1/4 w-[120vw] h-[120vh] mix-blend-screen pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 70% 40%, rgba(59,130,246,0.1) 0%, rgba(99,102,241,0.05) 30%, transparent 60%)',
          filter: 'blur(120px)'
        }}
        animate={{ 
            x: ['5%', '-5%', '5%'], 
            y: ['5%', '-5%', '5%'],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.2, 1]
        }}
        transition={{ duration: 60, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* Starfield with Parallax */}
      <motion.div style={{ y: starsY }} className="absolute inset-0 w-full h-[150%] -top-[25%] pointer-events-none">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </motion.div>
      
      {/* Majestic Light Beam with Scroll Fade */}
      <motion.div 
        className="absolute left-1/2 top-0 bottom-0 w-[600px] -translate-x-1/2 pointer-events-none mix-blend-screen"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(147,51,234,0.15) 30%, rgba(236,72,153,0.3) 50%, rgba(147,51,234,0.15) 70%, transparent 100%)',
          filter: 'blur(50px)',
          opacity: beamOpacity
        }}
        animate={{ scaleX: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Interactive WebGL Globe */}
      <motion.div 
        className="absolute top-[20%] md:top-[12%] left-1/2 -translate-x-1/2 w-[160vw] h-[160vw] max-w-[1200px] max-h-[1200px] sm:w-[110vw] sm:h-[110vw] md:w-[1000px] md:h-[1000px] lg:w-[1100px] lg:h-[1100px]"
        style={{ scale: earthScale, y: earthY, opacity: earthOpacity }}
      >
        {/* Outer Atmospheric Glow */}
        <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-[120px] animate-pulse pointer-events-none" style={{ animationDuration: '6s' }} />
        <div className="absolute inset-10 rounded-full bg-indigo-500/5 blur-[100px] animate-pulse pointer-events-none" style={{ animationDuration: '8s' }} />

        
        {/* Globe Container */}
        <div className="relative w-full h-full flex items-center justify-center">
          <InteractiveGlobe scrollRotation={scrollRotation} />
        </div>
      </motion.div>
      
      {/* Subtle Vignette for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020106_100%)] opacity-70 pointer-events-none" />
      {/* Bottom gradient mask specifically for text contrast across the page */}
      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#020106] via-[#020106]/70 to-transparent pointer-events-none" />
    </div>
  );
}

