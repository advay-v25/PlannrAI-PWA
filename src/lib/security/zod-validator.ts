import { z } from 'zod';

/**
 * Sanitize strings by stripping basic HTML to prevent XSS
 */
const sanitizeString = (val: string) => {
    return val
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/'/g, "&#39;")
        .replace(/"/g, "&quot;");
};

// Reusable Zod Types
export const zSanitizedString = z.string().transform(sanitizeString);

export function validateWithZod<T>(schema: z.ZodSchema<T>, data: unknown): { valid: true; data: T } | { valid: false; errors: string } {
    try {
        const parsed = schema.parse(data);
        return { valid: true, data: parsed };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
            return { valid: false, errors: messages };
        }
        return { valid: false, errors: 'Validation failed' };
    }
}
