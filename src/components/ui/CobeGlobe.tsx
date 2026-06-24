'use client';

import React, { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

export function CobeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);

  useEffect(() => {
    let phi = 0;
    let width = 0;
    let frameId: number;

    const onResize = () => {
      if (canvasRef.current) {
        width = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    const globe = createGlobe(canvasRef.current!, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.3,
      dark: 1, // 1 is dark mode
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.7, 0.5, 0.9], // Purple continents
      markerColor: [0.6, 0.2, 1.0], // Brand purple
      glowColor: [0.6, 0.2, 1.0],
      markers: [
        // PlannrAI user hubs / cool locations
        { location: [37.7595, -122.4367], size: 0.05 }, // SF
        { location: [40.7128, -74.0060], size: 0.05 },  // NY
        { location: [51.5074, -0.1278], size: 0.05 },   // London
        { location: [28.6139, 77.2090], size: 0.05 },   // Delhi
        { location: [35.6762, 139.6503], size: 0.05 },  // Tokyo
      ],
      onRender: (state: any) => {
        // Handle rotation and interaction
        if (!pointerInteracting.current) {
          phi += 0.005;
        }
        state.phi = phi + (pointerInteractionMovement.current / 200);
        state.width = width * 2;
        state.height = width * 2;
      }
    } as any);

    return () => {
      globe.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="w-full max-w-[800px] aspect-square relative flex items-center justify-center m-auto">
      <canvas
        ref={canvasRef}
        className="w-full h-full opacity-80 cursor-grab active:cursor-grabbing hover:opacity-100 transition-opacity duration-1000"
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX;
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        }}
        onPointerUp={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        }}
        onMouseMove={(e) => {
          if (pointerInteracting.current !== null) {
            const delta = e.clientX - pointerInteracting.current;
            pointerInteractionMovement.current = delta;
          }
        }}
        onTouchMove={(e) => {
          if (pointerInteracting.current !== null && e.touches[0]) {
            const delta = e.touches[0].clientX - pointerInteracting.current;
            pointerInteractionMovement.current = delta;
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          contain: 'layout paint size',
        }}
      />
    </div>
  );
}
