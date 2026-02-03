/**
 * Input Validator - Strict validation and sanitization
 * Prevents XSS, injection attacks, and malformed data
 */

// HTML entities for XSS prevention
const HTML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
};

// Dangerous patterns to block
const DANGEROUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // Script tags
    /javascript:/gi,                                         // JavaScript protocol
    /on\w+\s*=/gi,                                          // Event handlers
    /data:/gi,                                               // Data URLs
    /vbscript:/gi,                                          // VBScript
    /expression\s*\(/gi,                                     // CSS expressions
];

// SQL injection patterns
const SQL_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi,
    /(--)|(\/\*)|(\*\/)/g,                                   // SQL comments
    /(\bOR\b|\bAND\b)\s*\d*\s*[=<>]/gi,                    // Boolean injection
];

export interface ValidationResult {
    valid: boolean;
    sanitized: string;
    errors: string[];
}

export interface ValidationOptions {
    maxLength?: number;
    minLength?: number;
    allowHtml?: boolean;
    allowNewlines?: boolean;
    trimWhitespace?: boolean;
    toLowerCase?: boolean;
    pattern?: RegExp;
    customValidator?: (value: string) => boolean;
}

/**
 * Main validation function
 */
export function validateInput(
    input: unknown,
    options: ValidationOptions = {}
): ValidationResult {
    const errors: string[] = [];

    // Type check
    if (typeof input !== 'string') {
        return {
            valid: false,
            sanitized: '',
            errors: ['Input must be a string'],
        };
    }

    let value = input;

    // Trim whitespace
    if (options.trimWhitespace !== false) {
        value = value.trim();
    }

    // Length validation
    if (options.minLength && value.length < options.minLength) {
        errors.push(`Input must be at least ${options.minLength} characters`);
    }

    if (options.maxLength && value.length > options.maxLength) {
        errors.push(`Input must be at most ${options.maxLength} characters`);
        value = value.slice(0, options.maxLength);
    }

    // Sanitize HTML if not allowed
    if (!options.allowHtml) {
        value = escapeHtml(value);
    }

    // Remove dangerous patterns
    value = removeDangerousPatterns(value);

    // Block SQL-like patterns  
    if (containsSqlPatterns(input)) {
        errors.push('Input contains potentially dangerous patterns');
    }

    // Remove newlines if not allowed
    if (!options.allowNewlines) {
        value = value.replace(/[\r\n]/g, ' ');
    }

    // Convert to lowercase
    if (options.toLowerCase) {
        value = value.toLowerCase();
    }

    // Pattern validation
    if (options.pattern && !options.pattern.test(value)) {
        errors.push('Input does not match required pattern');
    }

    // Custom validator
    if (options.customValidator && !options.customValidator(value)) {
        errors.push('Input failed custom validation');
    }

    return {
        valid: errors.length === 0,
        sanitized: value,
        errors,
    };
}

/**
 * Escape HTML entities
 */
export function escapeHtml(str: string): string {
    return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove dangerous patterns
 */
function removeDangerousPatterns(str: string): string {
    let result = str;
    for (const pattern of DANGEROUS_PATTERNS) {
        result = result.replace(pattern, '');
    }
    return result;
}

/**
 * Check for SQL injection patterns
 */
function containsSqlPatterns(str: string): boolean {
    return SQL_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Validate email address
 */
export function validateEmail(email: unknown): ValidationResult {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const result = validateInput(email, {
        maxLength: 254,
        pattern: emailPattern,
        toLowerCase: true,
        trimWhitespace: true,
    });

    if (!result.valid) {
        result.errors.push('Invalid email format');
    }

    return result;
}

/**
 * Validate UUID
 */
export function validateUUID(uuid: unknown): ValidationResult {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return validateInput(uuid, {
        maxLength: 36,
        minLength: 36,
        pattern: uuidPattern,
        toLowerCase: true,
    });
}

/**
 * Validate and sanitize brain dump content
 */
export function validateBrainDump(content: unknown): ValidationResult {
    return validateInput(content, {
        maxLength: 10000,   // 10K chars max
        minLength: 1,
        allowNewlines: true,
        allowHtml: false,
    });
}

/**
 * Validate coach message
 */
export function validateCoachMessage(message: unknown): ValidationResult {
    return validateInput(message, {
        maxLength: 2000,
        minLength: 1,
        allowNewlines: true,
        allowHtml: false,
    });
}

/**
 * Validate goal title
 */
export function validateGoalTitle(title: unknown): ValidationResult {
    return validateInput(title, {
        maxLength: 200,
        minLength: 1,
        allowNewlines: false,
        allowHtml: false,
        trimWhitespace: true,
    });
}

/**
 * Sanitize object - validate all string fields
 */
export function sanitizeObject<T extends Record<string, unknown>>(
    obj: T,
    fieldOptions: Partial<Record<keyof T, ValidationOptions>> = {}
): { valid: boolean; data: T; errors: Record<string, string[]> } {
    const errors: Record<string, string[]> = {};
    const sanitized = { ...obj };

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            const options = fieldOptions[key as keyof T] || {};
            const result = validateInput(value, options);

            if (!result.valid) {
                errors[key] = result.errors;
            }

            (sanitized as Record<string, unknown>)[key] = result.sanitized;
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        data: sanitized,
        errors,
    };
}

/**
 * Prevent prompt injection for AI inputs
 */
export function sanitizeForAI(input: string): string {
    // Remove common prompt injection patterns
    let sanitized = input
        .replace(/ignore\s+(previous|all|above)\s+instructions?/gi, '')
        .replace(/disregard\s+(previous|all|above)/gi, '')
        .replace(/you\s+are\s+now/gi, '')
        .replace(/act\s+as\s+(if|a)/gi, '')
        .replace(/pretend\s+(to\s+be|you)/gi, '')
        .replace(/system\s*:/gi, '')
        .replace(/\[INST\]/gi, '')
        .replace(/<\|.*?\|>/g, '');

    // Limit length
    if (sanitized.length > 5000) {
        sanitized = sanitized.slice(0, 5000);
    }

    return sanitized.trim();
}
