/**
 * Minimal Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) over Deno's WebCrypto.
 *
 * Written by hand rather than pulled from a vendor SDK because the Node
 * `web-push` package assumes Node crypto and the Deno ports expect VAPID keys
 * in JWK form, while ours are the standard base64url raw keys. Everything here
 * is plain WebCrypto, which Deno Deploy supports natively.
 */

const encoder = new TextEncoder();

export function b64urlToBytes(input: string): Uint8Array {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function bytesToB64url(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

/** HKDF-Extract + Expand in one step, exactly as RFC 8291 specifies it. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
        key,
        length * 8
    );
    return new Uint8Array(bits);
}

export interface VapidKeys {
    publicKey: string;   // base64url, raw 65-byte uncompressed P-256 point
    privateKey: string;  // base64url, raw 32-byte scalar
    subject: string;     // mailto: or https: contact
}

/**
 * VAPID auth header. The JWT is scoped to the push service's origin (`aud`) and
 * is re-minted per request — cheap, and avoids caching an expiring token.
 */
export async function buildVapidHeader(endpoint: string, keys: VapidKeys): Promise<string> {
    const audience = new URL(endpoint).origin;
    const publicKeyBytes = b64urlToBytes(keys.publicKey);

    const jwk: JsonWebKey = {
        kty: 'EC',
        crv: 'P-256',
        d: keys.privateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        x: bytesToB64url(publicKeyBytes.slice(1, 33)),
        y: bytesToB64url(publicKeyBytes.slice(33, 65)),
        ext: true,
    };

    const signingKey = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );

    const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payload = bytesToB64url(encoder.encode(JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
    })));

    const unsigned = `${header}.${payload}`;
    // WebCrypto emits the raw r||s pair, which is precisely what ES256 wants.
    const signature = new Uint8Array(await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        signingKey,
        encoder.encode(unsigned) as BufferSource
    ));

    return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${keys.publicKey}`;
}

/** RFC 8291 §3.4: derive CEK/nonce from the ECDH secret, then AES-128-GCM. */
export async function encryptPayload(
    payload: string,
    p256dh: string,
    auth: string
): Promise<{ body: Uint8Array }> {
    const uaPublic = b64urlToBytes(p256dh);
    const authSecret = b64urlToBytes(auth);

    const ephemeral = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    ) as CryptoKeyPair;
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

    const uaKey = await crypto.subtle.importKey(
        'raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
    const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256
    ));

    const keyInfo = concat(encoder.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
    const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

    const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
    // 0x02 is the final-record padding delimiter; we always send a single record.
    const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, plaintext as BufferSource
    ));

    // aes128gcm header: salt(16) | record size(4, BE) | key id length(1) | key id
    const recordSize = new Uint8Array(4);
    new DataView(recordSize.buffer).setUint32(0, 4096, false);

    return {
        body: concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext),
    };
}

export interface PushTarget {
    endpoint: string;
    p256dh: string;
    auth: string;
}

export interface PushResult {
    ok: boolean;
    status: number;
    /** 404/410 — the endpoint is permanently gone and its row should be deleted. */
    gone: boolean;
    error?: string;
}

export async function sendPush(
    target: PushTarget,
    payload: unknown,
    keys: VapidKeys,
    ttlSeconds = 300
): Promise<PushResult> {
    try {
        const { body } = await encryptPayload(JSON.stringify(payload), target.p256dh, target.auth);
        const authorization = await buildVapidHeader(target.endpoint, keys);

        const res = await fetch(target.endpoint, {
            method: 'POST',
            headers: {
                Authorization: authorization,
                'Content-Encoding': 'aes128gcm',
                'Content-Type': 'application/octet-stream',
                TTL: String(ttlSeconds),
                Urgency: 'high',
            },
            body: body as BodyInit,
        });

        if (res.ok) return { ok: true, status: res.status, gone: false };

        const detail = await res.text().catch(() => '');
        return {
            ok: false,
            status: res.status,
            gone: res.status === 404 || res.status === 410,
            error: detail.slice(0, 300),
        };
    } catch (err) {
        return { ok: false, status: 0, gone: false, error: String(err) };
    }
}
