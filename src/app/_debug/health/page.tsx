
'use client';

import { useState, useEffect } from 'react';

export default function HealthPage() {
    const [status, setStatus] = useState<any>({ database: 'checking', optimizer: 'checking', auth: 'checking' });

    useEffect(() => {
        // Run checks
        Promise.all([
            fetch('/api/data?table=users&limit=1').then(r => r.ok ? 'connected' : 'error'),
            // check optimizer by running a dummy deviation check or similar
            fetch('/api/deviation').then(r => r.ok ? 'ready' : 'error'),
            fetch('/api/auth/session').then(r => r.ok ? 'active' : 'none'),
        ]).then(([db, opt, auth]) => {
            setStatus({ database: db, optimizer: opt, auth });
        });
    }, []);

    return (
        <div className="p-8 text-white space-y-8">
            <h1 className="text-3xl font-bold">System Health</h1>

            <div className="grid grid-cols-3 gap-4">
                <StatusCard label="Supabase" status={status.database} />
                <StatusCard label="Optimizer" status={status.optimizer} />
                <StatusCard label="Auth Session" status={status.auth} />
            </div>

            <div className="p-4 bg-white/5 rounded-xl">
                <h3 className="font-bold mb-2">Internal Logs</h3>
                <pre className="text-xs font-mono text-gray-400">
                    No logs available in client mode yet.
                </pre>
            </div>
        </div>
    );
}

function StatusCard({ label, status }: { label: string, status: string }) {
    const color = status === 'connected' || status === 'ready' || status === 'active'
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : (status === 'checking' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/20 text-red-400 border-red-500/30');

    return (
        <div className={`p-6 rounded-xl border ${color}`}>
            <div className="text-sm uppercase opacity-70">{label}</div>
            <div className="text-2xl font-bold capitalize">{status}</div>
        </div>
    );
}
