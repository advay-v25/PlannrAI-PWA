'use client';

import { motion } from 'framer-motion';

export interface HomeLayoutProps {
    header: React.ReactNode;
    nowCard: React.ReactNode;
    timeline: React.ReactNode;
    stacks: React.ReactNode;
    briefing: React.ReactNode;
}

export function HomeLayout({ header, nowCard, timeline, stacks, briefing }: HomeLayoutProps) {
    return (
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10 space-y-8 md:space-y-12 pb-32">
            {/* Header */}
            <header className="mb-8">
                {header}
            </header>

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">

                {/* Left Column (Primary Focus) - 7 cols */}
                <div className="md:col-span-7 space-y-8">
                    {/* Now Card (The Anchor) */}
                    <section>
                        {nowCard}
                    </section>

                    {/* Timeline Strip */}
                    <section>
                        {timeline}
                    </section>
                </div>

                {/* Right Column (Secondary / Context) - 5 cols */}
                <div className="md:col-span-5 space-y-6">
                    {/* Briefing / State */}
                    <section>
                        {briefing}
                    </section>

                    {/* Stacks */}
                    <section>
                        {stacks}
                    </section>
                </div>
            </div>
        </div>
    );
}
