import { NextResponse } from 'next/server';

export const API_ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    BAD_REQUEST: 'BAD_REQUEST',
    RATE_LIMITED: 'RATE_LIMITED'
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_CODES;

export function apiError(
    code: ApiErrorCode | string,
    message: string,
    status: number = 400,
    details?: any
) {
    return NextResponse.json({
        error: code,
        message,
        details,
        timestamp: new Date().toISOString()
    }, { status });
}

export function apiSuccess<T>(data: T, status: number = 200) {
    return NextResponse.json(data, { status });
}

// Common patterns
export const responses = {
    unauthorized: (message = 'Unauthorized access') =>
        apiError(API_ERROR_CODES.UNAUTHORIZED, message, 401),

    forbidden: (message = 'Forbidden access') =>
        apiError(API_ERROR_CODES.FORBIDDEN, message, 403),

    validationError: (details: any, message = 'Validation failed') =>
        apiError(API_ERROR_CODES.VALIDATION_ERROR, message, 400, details),

    notFound: (message = 'Resource not found') =>
        apiError(API_ERROR_CODES.NOT_FOUND, message, 404),

    internalError: (message = 'An internal server error occurred', details?: any) =>
        apiError(API_ERROR_CODES.INTERNAL_ERROR, message, 500, details)
};
