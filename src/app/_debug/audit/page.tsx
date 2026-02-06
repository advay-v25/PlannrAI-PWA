
'use client';

import { useState, useEffect } from 'react';

export default function AuditPage() {
    const [audit, setAudit] = useState<any[]>([]);

    useEffect(() => {
        // In a real app we'd expose this via an API, but for dev we can just hardcode or fetch if we copy the file to public
        // For now, let's assume we create an API route to serve this JSON.
        fetch('/api/debug/audit').then(res => res.json()).then(setAudit).catch(console.error);
    }, []);

    return (
        <div className="p-8 text-white">
            <h1 className="text-2xl font-bold mb-4">CTA Audit ({audit.length})</h1>
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-left font-mono text-[var(--text-secondary)]">
                        <th>File</th>
                        <th>Element</th>
                        <th>Label</th>
                        <th>Handler</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {audit.map((item, i) => (
                        <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-1 font-mono">{item.file.replace('src/', '')}:{item.line}</td>
                            <td>{item.element}</td>
                            <td>{item.label}</td>
                            <td className="font-mono">{item.handler}</td>
                            <td>
                                <span className={`px-1 rounded ${item.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {item.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
