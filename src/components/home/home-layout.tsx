'use client';

export interface HomeLayoutProps {
    header: React.ReactNode;
    commandCenter: React.ReactNode;
    dashboardCards?: React.ReactNode;
    timeline: React.ReactNode;
    insights: React.ReactNode;
}

export function HomeLayout({
    header,
    commandCenter,
    dashboardCards,
    timeline,
    insights
}: HomeLayoutProps) {
    return (
        <div className="mx-auto max-w-4xl px-4 md:px-8 py-6 md:py-10 space-y-12 pb-32">
            {/* Header */}
            <header>
                {header}
            </header>

            {/* Section 1: Command Center Hero (70% viewport height handled by component min-h) */}
            <section className="w-full relative">
                {commandCenter}
            </section>

            {/* Section 1.5: Dashboard Cards (Goals, AI Insights, Focus) */}
            {dashboardCards && (
                <section className="w-full">
                    {dashboardCards}
                </section>
            )}

            {/* Section 2: Timeline */}
            <section className="w-full">
                {timeline}
            </section>

            {/* Section 3: Insights & Utilities */}
            <section className="w-full">
                {insights}
            </section>
        </div>
    );
}
