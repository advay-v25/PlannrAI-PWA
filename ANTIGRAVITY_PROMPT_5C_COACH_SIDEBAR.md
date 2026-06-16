# Antigravity Prompt 5C — Coach Hub: Always New Chat + Left Sidebar

## Problem

1. When a user navigates to Coach Hub, it resumes the last persisted conversation (Zustand persist). It should always open to a new, blank chat.
2. The past-chats history panel currently slides in from the right. The user wants a permanent left sidebar in the style of Claude's chat list — always visible, showing past conversations, with the chat taking up the remaining space to the right.

**Only change `src/components/coach/CoachChat.tsx`.** Nothing else. Do not change `use-coach.ts`, `CoachDashboard.tsx`, the page, or any API routes.

---

## Change A — Always start a new chat on mount

**Find** this `useEffect` near the top of the `CoachChat` component body:
```typescript
    useEffect(() => {
        if (messages.length === 0) loadHistory();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Replace with:**
```typescript
    // Always open to a fresh blank chat when the user lands on Coach Hub.
    // Past chats are accessible via the left sidebar.
    useEffect(() => {
        clearConversation();
        setSyntheticMessages([]);
        // Fetch past conversations for the left sidebar on mount
        (async () => {
            try {
                const res = await apiClient.get('/api/coach/conversations') as any;
                if (res?.success) setPastConversations(res.conversations || []);
            } catch (err) {
                console.error('Failed to fetch conversations', err);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## Change B — Restructure layout: add permanent left sidebar

The current root `<div>` of the return is:
```typescript
        <div className="flex flex-col h-full relative overflow-hidden bg-transparent">
```

**Replace the entire return block** with the new two-column layout below. The left sidebar is a fixed-width column (`w-56 shrink-0`) with a scrollable list of past conversations. The right side is the existing chat UI — all existing chat logic stays identical, just relocated into the right column.

```tsx
        return (
            <div className="flex h-full relative overflow-hidden bg-transparent">

                {/* ── LEFT SIDEBAR — Past Chats ── */}
                <div className="w-56 shrink-0 flex flex-col border-r border-white/[0.06] bg-[#080809]">
                    {/* Sidebar header */}
                    <div className="px-4 py-4 flex items-center justify-between border-b border-white/[0.05] shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Coach Hub</span>
                        <button
                            onClick={handleNewChat}
                            title="New conversation"
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-white/30 hover:text-white"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>

                    {/* New Chat button */}
                    <div className="px-3 pt-3 pb-2 shrink-0">
                        <button
                            onClick={handleNewChat}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15 transition-all text-left group"
                        >
                            <span className="text-orange-400 text-base">⚡</span>
                            <span className="text-[12px] font-bold text-orange-300/90 group-hover:text-orange-300">New Chat</span>
                        </button>
                    </div>

                    {/* Recents label */}
                    <div className="px-4 pt-2 pb-1 shrink-0">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">Recents</span>
                    </div>

                    {/* Conversation list */}
                    <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 scrollbar-hide">
                        {isLoadingHistoryList ? (
                            <p className="text-[11px] text-white/25 text-center py-6 animate-pulse">Loading…</p>
                        ) : pastConversations.length === 0 ? (
                            <p className="text-[11px] text-white/20 text-center py-6 leading-relaxed px-2">
                                No past chats yet.<br />Start a conversation below.
                            </p>
                        ) : (
                            pastConversations.map(conv => (
                                <div key={conv.id} className="relative group/item">
                                    <button
                                        onClick={() => {
                                            clearConversation();
                                            setSyntheticMessages([]);
                                            loadHistory(conv.id);
                                        }}
                                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.05] border border-transparent hover:border-white/[0.07] transition-all flex flex-col gap-0.5 pr-8"
                                    >
                                        <span className="text-[12px] font-medium text-white/65 hover:text-orange-300 transition-colors truncate leading-snug">
                                            {conv.primary_topic || 'Strategy Session'}
                                        </span>
                                        <span className="text-[10px] text-white/25">
                                            {conv.last_message_at
                                                ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
                                                : '—'}
                                        </span>
                                    </button>
                                    <button
                                        onClick={e => handleDeleteChat(e, conv.id)}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/10 opacity-0 group-hover/item:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                        title="Delete"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── RIGHT — Chat area ── */}
                <div className="flex flex-col flex-1 min-w-0 relative overflow-hidden">

                    {/* ── Header ── */}
                    <div className="z-20 px-5 py-4 flex justify-between items-center border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur-md shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                                <span className="text-white text-sm">⚡</span>
                            </div>
                            <div>
                                <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                                    Donna
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                                </span>
                                <span className="text-[10px] text-white/35 uppercase tracking-wider block">
                                    Strategic Mode · Calendar · Goals · Tasks
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleNewChat}
                                title="New conversation"
                                className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors text-white/35 hover:text-white"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* ── Error banner ── */}
                    {error && (
                        <div className="z-10 bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex justify-between items-center backdrop-blur-md shrink-0">
                            <span className="text-xs text-red-400 font-medium">{error}</span>
                            <button onClick={clearError} className="text-red-400/50 hover:text-red-400 text-lg leading-none">×</button>
                        </div>
                    )}

                    {/* ── Messages ── */}
                    <div className="z-10 flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-hide">

                        {/* Empty state — 2 quick-action bubbles */}
                        {allMessages.length === 0 && !showLoadingIndicator && (
                            <div className="flex flex-col items-center mt-10 animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500/50 mx-auto mb-5 flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                                    <span className="text-white text-2xl">⚡️</span>
                                </div>
                                <p className="text-lg font-semibold text-white mb-1">How shall we architect today?</p>
                                <p className="text-xs text-white/35 italic mb-8">Or type anything below to start a conversation.</p>

                                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
                                    {quickBubbles.map(bubble => (
                                        <button
                                            key={bubble.action}
                                            onClick={() => handleQuickAction(bubble.action)}
                                            disabled={showLoadingIndicator}
                                            className="flex-1 flex flex-col items-start gap-2 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:border-orange-500/25 hover:bg-orange-500/10 transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none group"
                                        >
                                            <span className="text-2xl">{bubble.emoji}</span>
                                            <span className="font-semibold text-white/90 text-[15px] group-hover:text-orange-300 transition-colors">{bubble.label}</span>
                                            <span className="text-xs text-white/40">{bubble.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Message thread */}
                        {allMessages.map((message, index) => (
                            <div key={message.id || index} className="space-y-3">
                                <CoachMessageBubble message={message} />

                                {/* Inline options */}
                                {message.role === 'assistant' &&
                                    message.options &&
                                    message.options.length > 0 &&
                                    !message.selected_option_id &&
                                    !message.isApplying && (
                                    <div className="pl-2 space-y-2">
                                        {message.options.map(opt => (
                                            <InlineOptionCard
                                                key={opt.id}
                                                option={opt}
                                                onSelect={() => handleOptionSelect(opt, message.id || '')}
                                                disabled={isApplyingChanges || showLoadingIndicator}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Applying indicator */}
                                {message.role === 'assistant' &&
                                    message.options &&
                                    message.options.length > 0 &&
                                    message.isApplying && (
                                    <div className="pl-2">
                                        <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex items-center gap-3 animate-pulse">
                                            <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                                <span className="text-[10px] text-yellow-400 animate-spin">⚡</span>
                                            </div>
                                            <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">Applying Changes…</span>
                                        </div>
                                    </div>
                                )}

                                {/* Applied confirmation */}
                                {message.role === 'assistant' &&
                                    message.selected_option_id &&
                                    !message.isApplying && (
                                    <div className="pl-2">
                                        <div className="p-3 rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-[10px] text-white">✓</div>
                                                <div>
                                                    <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase block">Applied</span>
                                                    <span className="text-sm text-white/70">
                                                        {message.options?.find(o => o.id === message.selected_option_id)?.title}
                                                    </span>
                                                </div>
                                            </div>
                                            {message.undoToken && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleUndo(); }}
                                                    disabled={isLoading}
                                                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400 uppercase tracking-wider hover:bg-red-500/20 transition-all disabled:opacity-50"
                                                >
                                                    ↩ Undo
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Suggested follow-ups */}
                                {message.role === 'assistant' &&
                                    message.suggestedActions &&
                                    message.suggestedActions.length > 0 &&
                                    !message.selected_option_id && (
                                    <div className="flex flex-wrap gap-2 pl-2">
                                        {message.suggestedActions.map((action, i) => (
                                            <button
                                                key={i}
                                                onClick={() => sendMessage(action)}
                                                disabled={showLoadingIndicator}
                                                className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.07] rounded-full text-[11px] text-white/40 hover:text-white hover:bg-orange-500/10 hover:border-orange-500/25 transition-all disabled:opacity-50"
                                            >
                                                {action}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {showLoadingIndicator && (
                            <div className="flex items-start gap-4 animate-fade-in pl-2">
                                <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
                                    <div className="absolute inset-2 bg-gradient-to-tr from-purple-500 to-orange-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                                    <div className="absolute inset-0 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
                                    <div className="absolute inset-0 border-[1.5px] border-b-orange-500 border-r-transparent border-t-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                                </div>
                                <div className="pt-1">
                                    <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[260px]">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] text-white/55 font-mono tracking-wide italic">
                                                {stages[loadingStage]}
                                            </span>
                                            <div className="flex gap-1 shrink-0">
                                                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(251,146,60,0.8)]" style={{ animationDelay: '0s' }} />
                                                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(168,85,247,0.8)]" style={{ animationDelay: '0.2s' }} />
                                                <span className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce shadow-[0_0_8px_rgba(236,72,153,0.8)]" style={{ animationDelay: '0.4s' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Changes in progress toast */}
                    {isApplyingChanges && (
                        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-primary)] text-white px-6 py-3 rounded-full shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.5)] flex items-center gap-3 animate-fade-in">
                            <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                            <span className="font-bold tracking-wide text-sm uppercase">Applying Changes</span>
                        </div>
                    )}

                    {/* Undo strip */}
                    {canUndo && !isLoading && (
                        <div className="z-10 px-8 py-3 border-t border-white/[0.05] bg-black/20 backdrop-blur-sm flex justify-center shrink-0">
                            <button
                                onClick={handleUndo}
                                className="text-[10px] font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] uppercase tracking-widest flex items-center gap-2"
                            >
                                Revert Last Protocol ↩
                            </button>
                        </div>
                    )}

                    {/* Input bar */}
                    <div className="z-10 border-t border-white/[0.05] bg-[#0a0a0b]/80 backdrop-blur-3xl pb-2 shrink-0">
                        <form onSubmit={handleSubmit} className="px-5 py-3">
                            <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-[1.5rem] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all focus-within:border-orange-500/50 focus-within:bg-[#0a0a0b] focus-within:shadow-[0_0_40px_rgba(249,115,22,0.15)] group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-amber-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                                <input
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    placeholder={allMessages.length > 0 ? 'Message Donna…' : 'Or type anything to start a conversation…'}
                                    disabled={showLoadingIndicator}
                                    className="flex-1 bg-transparent px-4 py-3.5 text-[15px] focus:outline-none placeholder:text-white/25 text-white font-medium relative z-10"
                                />
                                <button
                                    type="submit"
                                    disabled={showLoadingIndicator || !input.trim()}
                                    className="w-12 h-12 bg-white/[0.03] hover:bg-gradient-to-tr hover:from-orange-500 hover:to-amber-500 rounded-[1.1rem] flex items-center justify-center transition-all text-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/[0.03] relative z-10"
                                >
                                    <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Confirmation modal */}
                    {showPreview && pendingOption && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                            <ConfirmationModal
                                option={pendingOption}
                                onConfirm={() => {
                                    setShowPreview(false);
                                    const isSynthetic = pendingParentId.startsWith('assistant_') || pendingParentId.startsWith('local_');
                                    executeApply(pendingOption, pendingParentId, isSynthetic);
                                    setPendingOption(null);
                                    setPendingParentId('');
                                }}
                                onCancel={() => {
                                    setShowPreview(false);
                                    setPendingOption(null);
                                    setPendingParentId('');
                                }}
                                isLoading={isApplyingChanges}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
```

---

## Also remove `handleOpenHistory` and the `isHistoryOpen` state

The old right-side slide-in panel and its `handleOpenHistory` / `isHistoryOpen` state are now replaced by the always-visible left sidebar. Remove these from the component:

```typescript
    // DELETE these — no longer needed
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const handleOpenHistory = async () => {
        // ... entire function
    };
```

The `pastConversations` and `isLoadingHistoryList` states stay — they're used by the left sidebar. The left sidebar loads conversations in the mount `useEffect` instead.

Also remove the `AnimatePresence` + history slide-in panel block that starts with:
```typescript
            {/* ── History slide-in panel ── */}
            <AnimatePresence>
                {isHistoryOpen && (
```
...and the history clock button in the old header. The new header only has one button: the new-chat `+` button.

---

## Summary

| What | How |
|------|-----|
| Always new chat on open | Mount `useEffect` calls `clearConversation()` + `setSyntheticMessages([])` instead of `loadHistory()` |
| Left sidebar | Root div becomes `flex-row`; new `w-56` left column shows conversation list loaded on mount |
| Past chat click | `clearConversation()` + `loadHistory(conv.id)` — clears current state then loads selected chat |
| Removed | `isHistoryOpen` state, `handleOpenHistory`, right-side `AnimatePresence` slide-in panel, history clock icon in header |
| Kept identical | All message rendering, option cards, loading states, quick-action handler, apply/undo flow, input bar, confirmation modal |
