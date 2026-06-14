'use client';

import { useEffect } from 'react';

// Standard US/UK keyboard characters (ASCII 32-126) + newlines + tabs
// This explicitly blocks all emojis, extended unicode symbols, math symbols, etc.
const ALLOWED_REGEX = /^[\x20-\x7E\n\r\t]+$/;

export function GlobalInputSanitizer() {
    useEffect(() => {
        const handleBeforeInput = (e: InputEvent) => {
            // e.data contains the text being inserted (null for deletions/formatting)
            if (e.data && !ALLOWED_REGEX.test(e.data)) {
                e.preventDefault();
            }
        };

        const handlePaste = (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            
            const text = e.clipboardData.getData('text/plain');
            if (!text) return;
            
            // If the pasted text contains invalid characters
            if (!ALLOWED_REGEX.test(text)) {
                e.preventDefault();
                
                // Extract only valid characters
                const sanitized = text.split('').filter(c => ALLOWED_REGEX.test(c)).join('');
                
                if (sanitized) {
                    // Try to insert the sanitized text manually
                    try {
                        document.execCommand('insertText', false, sanitized);
                    } catch (err) {
                        // fallback if execCommand is unsupported in a specific context
                        console.warn('Could not insert sanitized paste automatically');
                    }
                }
            }
        };

        document.addEventListener('beforeinput', handleBeforeInput as EventListener, true);
        document.addEventListener('paste', handlePaste, true);

        return () => {
            document.removeEventListener('beforeinput', handleBeforeInput as EventListener, true);
            document.removeEventListener('paste', handlePaste, true);
        };
    }, []);

    return null;
}
