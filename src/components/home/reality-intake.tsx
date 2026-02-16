
import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

export function RealityIntake({ onUpdate }: any) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [processing, setProcessing] = useState(false);
    const [options, setOptions] = useState<any[] | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;

        setProcessing(true);

        try {
            // 1. Submit to API
            const res = await fetch('/api/home/reality-intake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    date: new Date().toISOString().split('T')[0]
                })
            });

            const json = await res.json();

            if (json.data?.analysis?.options) {
                setOptions(json.data.analysis.options);
                // If only 1 high conf option, maybe suggest it directly?
                // For now, list options.
            } else {
                toast.success("Logged to Brain Dump.");
                setOpen(false);
                setText('');
            }

        } catch (err) {
            toast.error("Failed to process.");
        } finally {
            setProcessing(false);
        }
    };

    const handleApplyOption = async (option: any) => {
        // Apply Patch
        const loadId = toast.loading("Applying changes...");
        const res = await fetch('/api/schedule/apply-patch', {
            method: 'POST',
            body: JSON.stringify({ patch: option.patch })
        });

        if (res.ok) {
            toast.dismiss(loadId);
            toast.success("Schedule Updated.");
            setOptions(null);
            setOpen(false);
            setText('');
            onUpdate();
        } else {
            toast.dismiss(loadId);
            toast.error("Update failed.");
        }
    };

    return (
        <>
            {/* FAB Trigger if closed */}
            {!open && (
                <div className="fixed bottom-6 right-6 z-50">
                    <button
                        onClick={() => setOpen(true)}
                        className="w-14 h-14 rounded-full bg-[var(--color-primary)] text-black shadow-[0_0_20px_var(--color-primary)] flex items-center justify-center hover:scale-105 transition-transform"
                    >
                        <Sparkles className="w-6 h-6" />
                    </button>
                </div>
            )}

            {/* Input Overlay */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-xl border-t border-white/10 z-50 pb-8 rounded-t-3xl"
                    >
                        <div className="max-w-md mx-auto relative">
                            {/* Close button */}
                            <button onClick={() => setOpen(false)} className="absolute -top-12 right-0 w-8 h-8 flex items-center justify-center bg-white/10 rounded-full text-white">
                                <X className="w-4 h-4" />
                            </button>

                            {!options ? (
                                <form onSubmit={handleSubmit} className="flex gap-2">
                                    <input
                                        ref={inputRef}
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                        disabled={processing}
                                        placeholder="What changed? (e.g. 'Meeting ran late', 'Too tired')"
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                                    />
                                    <button
                                        type="submit"
                                        disabled={processing || !text.trim()}
                                        className="w-12 flex items-center justify-center bg-[var(--color-primary)] text-black rounded-xl disabled:opacity-50"
                                    >
                                        {processing ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                                    </button>
                                </form>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-sm text-white/70">AI suggests:</p>
                                    <div className="grid gap-2">
                                        {options.map((opt: any, i: number) => (
                                            <button
                                                key={i}
                                                onClick={() => handleApplyOption(opt)}
                                                className="text-left p-3 rounded-xl bg-white/10 border border-white/5 hover:bg-white/20 transition-colors"
                                            >
                                                <div className="font-bold text-sm text-[var(--color-primary)]">{opt.label}</div>
                                                {opt.tradeoff && <div className="text-xs text-white/50">{opt.tradeoff}</div>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
