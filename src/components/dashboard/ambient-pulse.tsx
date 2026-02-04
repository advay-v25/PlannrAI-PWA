'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface AmbientPulseProps {
    energyLevel?: number; // 1-5
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    isActive?: boolean; // Currently in a focus block
}

// Determines visual theme based on time and energy
function getTheme(timeOfDay: string, energy: number, isActive: boolean) {
    // Active mode overrides everything - deep focus colors
    if (isActive) {
        return {
            primary: 'rgba(99, 102, 241, 0.15)', // Indigo
            secondary: 'rgba(139, 92, 246, 0.1)', // Violet
            accent: 'rgba(59, 130, 246, 0.08)', // Blue
            animation: 'slow',
        };
    }

    // Time-based themes modulated by energy
    const energyMultiplier = Math.max(0.4, energy / 5);

    switch (timeOfDay) {
        case 'morning':
            return {
                primary: `rgba(251, 146, 60, ${0.15 * energyMultiplier})`, // Orange
                secondary: `rgba(34, 211, 238, ${0.1 * energyMultiplier})`, // Cyan
                accent: `rgba(250, 204, 21, ${0.08 * energyMultiplier})`, // Yellow
                animation: energy >= 4 ? 'fast' : 'normal',
            };
        case 'afternoon':
            return {
                primary: `rgba(59, 130, 246, ${0.12 * energyMultiplier})`, // Blue
                secondary: `rgba(16, 185, 129, ${0.1 * energyMultiplier})`, // Emerald
                accent: `rgba(139, 92, 246, ${0.06 * energyMultiplier})`, // Violet
                animation: 'normal',
            };
        case 'evening':
            return {
                primary: `rgba(236, 72, 153, ${0.1 * energyMultiplier})`, // Pink
                secondary: `rgba(139, 92, 246, ${0.12 * energyMultiplier})`, // Violet
                accent: `rgba(99, 102, 241, ${0.08 * energyMultiplier})`, // Indigo
                animation: 'slow',
            };
        case 'night':
        default:
            return {
                primary: 'rgba(30, 41, 59, 0.5)', // Slate
                secondary: 'rgba(51, 65, 85, 0.3)', // Slate lighter
                accent: 'rgba(99, 102, 241, 0.05)', // Indigo hint
                animation: 'breathing',
            };
    }
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

export function AmbientPulse({
    energyLevel = 3,
    timeOfDay: overrideTime,
    isActive = false
}: AmbientPulseProps) {
    const [currentTime, setCurrentTime] = useState<'morning' | 'afternoon' | 'evening' | 'night'>(getTimeOfDay());

    useEffect(() => {
        // Update time every minute
        const timer = setInterval(() => {
            setCurrentTime(getTimeOfDay());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    const timeOfDay = overrideTime || currentTime;
    const theme = useMemo(() => getTheme(timeOfDay, energyLevel, isActive), [timeOfDay, energyLevel, isActive]);

    // Animation variants based on theme
    const animationDuration = theme.animation === 'fast' ? 4 : theme.animation === 'slow' ? 12 : theme.animation === 'breathing' ? 20 : 8;

    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            {/* Primary Orb - Top Left */}
            <motion.div
                className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[120px]"
                style={{ backgroundColor: theme.primary }}
                animate={{
                    scale: [1, 1.2, 1],
                    x: [0, 30, 0],
                    y: [0, 20, 0],
                }}
                transition={{
                    duration: animationDuration,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />

            {/* Secondary Orb - Bottom Right */}
            <motion.div
                className="absolute -bottom-48 -right-48 w-[500px] h-[500px] rounded-full blur-[150px]"
                style={{ backgroundColor: theme.secondary }}
                animate={{
                    scale: [1, 1.15, 1],
                    x: [0, -40, 0],
                    y: [0, -30, 0],
                }}
                transition={{
                    duration: animationDuration * 1.3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 2,
                }}
            />

            {/* Accent Orb - Center */}
            <motion.div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-[100px]"
                style={{ backgroundColor: theme.accent }}
                animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5],
                }}
                transition={{
                    duration: animationDuration * 0.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 1,
                }}
            />

            {/* Noise Texture Overlay */}
            <div
                className="absolute inset-0 opacity-[0.015]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />
        </div>
    );
}

// Hook to get bio-rhythm data for components
export function useBioRhythm(energyLevel?: number) {
    const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'evening' | 'night'>(getTimeOfDay());

    useEffect(() => {
        const timer = setInterval(() => setTimeOfDay(getTimeOfDay()), 60000);
        return () => clearInterval(timer);
    }, []);

    return {
        timeOfDay,
        theme: getTheme(timeOfDay, energyLevel || 3, false),
        isMorning: timeOfDay === 'morning',
        isEvening: timeOfDay === 'evening' || timeOfDay === 'night',
    };
}
