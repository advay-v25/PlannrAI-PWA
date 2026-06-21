import { apiSuccess as success, apiFail as fail } from '@/lib/api/envelope';

export const API_ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    BAD_REQUEST: 'BAD_REQUEST',
    RATE_LIMITED: 'RATE_LIMITED'
} as const;

type ApiErrorCode = keyof typeof API_ERROR_CODES;

export const apiError = fail;
export const apiSuccess = success;

// Common patterns
export const responses = {
    unauthorized: (message = 'Unauthorized access') =>
        apiError(message, 401, API_ERROR_CODES.UNAUTHORIZED),

    forbidden: (message = 'Forbidden access') =>
        apiError(message, 403, API_ERROR_CODES.FORBIDDEN),

    validationError: (details: any, message = 'Validation failed') =>
        apiError(message, 400, API_ERROR_CODES.VALIDATION_ERROR, details),

    notFound: (message = 'Resource not found') =>
        apiError(message, 404, API_ERROR_CODES.NOT_FOUND),

    internalError: (message = 'An internal server error occurred', details?: any) =>
        apiError(message, 500, API_ERROR_CODES.INTERNAL_ERROR, details)
};
