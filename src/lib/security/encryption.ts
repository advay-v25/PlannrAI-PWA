/**
 * Encryption Utilities - AES-256-GCM encryption for sensitive data
 * Used for encrypting coach conversations at rest
 */

// Web Crypto API for encryption
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

/**
 * Get encryption key from environment
 */
async function getEncryptionKey(): Promise<CryptoKey> {
    const keyString = process.env.ENCRYPTION_KEY;

    if (!keyString) {
        throw new Error('ENCRYPTION_KEY environment variable not set');
    }

    // Decode base64 key
    const keyData = Buffer.from(keyString, 'base64');

    if (keyData.length < 32) {
        throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
    }

    // Import key for AES-GCM
    return crypto.subtle.importKey(
        'raw',
        keyData.slice(0, 32),
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt a string value
 * Returns base64-encoded ciphertext with IV prepended
 */
export async function encrypt(plaintext: string): Promise<string> {
    try {
        const key = await getEncryptionKey();

        // Generate random IV
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

        // Encode plaintext
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        // Encrypt
        const ciphertext = await crypto.subtle.encrypt(
            { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
            key,
            data
        );

        // Combine IV + ciphertext
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        // Return base64
        return Buffer.from(combined).toString('base64');
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt a previously encrypted value
 */
export async function decrypt(encryptedData: string): Promise<string> {
    try {
        const key = await getEncryptionKey();

        // Decode base64
        const combined = Buffer.from(encryptedData, 'base64');

        // Extract IV and ciphertext
        const iv = combined.slice(0, IV_LENGTH);
        const ciphertext = combined.slice(IV_LENGTH);

        // Decrypt
        const plaintext = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
            key,
            ciphertext
        );

        // Decode and return
        const decoder = new TextDecoder();
        return decoder.decode(plaintext);
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Hash a value (one-way, for comparison)
 */
export async function hash(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Buffer.from(hashBuffer).toString('hex');
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Buffer.from(bytes).toString('base64url');
}

/**
 * Compare two strings in constant time (timing-safe)
 */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}

/**
 * Encrypt sensitive fields in an object
 */
export async function encryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: (keyof T)[]
): Promise<T> {
    const result = { ...obj };

    for (const field of fields) {
        const value = obj[field];
        if (typeof value === 'string' && value.length > 0) {
            (result as Record<string, unknown>)[field as string] = await encrypt(value);
        }
    }

    return result;
}

/**
 * Decrypt sensitive fields in an object
 */
export async function decryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: (keyof T)[]
): Promise<T> {
    const result = { ...obj };

    for (const field of fields) {
        const value = obj[field];
        if (typeof value === 'string' && value.length > 0) {
            try {
                (result as Record<string, unknown>)[field as string] = await decrypt(value);
            } catch {
                // Field may not be encrypted, leave as-is
            }
        }
    }

    return result;
}
