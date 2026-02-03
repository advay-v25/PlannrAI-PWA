import { TabBar, SideNav } from '@/components/navigation/tab-bar';

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen">
            {/* Desktop Sidebar */}
            <SideNav />

            {/* Main Content */}
            <main className="md:ml-64 pb-24 md:pb-8">
                <div className="max-w-2xl mx-auto px-4 py-6">
                    {children}
                </div>
            </main>

            {/* Mobile Tab Bar */}
            <div className="md:hidden">
                <TabBar />
            </div>
        </div>
    );
}
