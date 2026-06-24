import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type ApiEnvelope<T = any> = {
    ok: boolean;
    data?: T;
    error?: {
        message: string;
        code?: string;
        details?: any;
    };
    request_id: string;
    timestamp: string;
};

export function apiSuccess<T>(data: T, status: number = 200) {
    const request_id = uuidv4();
    const response: ApiEnvelope<T> = {
        ok: true,
        data,
        request_id,
        timestamp: new Date().toISOString()
    };
    return NextResponse.json(response, { status });
}

export function apiFail(
    message: string,
    status: number = 500,
    code?: string,
    details?: any,
    headers?: Headers | Record<string, string>
) {
    const request_id = uuidv4();
    console.error(`[API FAIL] [${request_id}] ${status} - ${message}`, details);

    const response: ApiEnvelope = {
        ok: false,
        error: {
            message,
            code: code || (status >= 500 ? 'INTERNAL_ERROR' : 'API_ERROR'),
            details
        },
        request_id,
        timestamp: new Date().toISOString()
    };

    return NextResponse.json(response, { status, headers });
}

export const apiError = apiFail;
