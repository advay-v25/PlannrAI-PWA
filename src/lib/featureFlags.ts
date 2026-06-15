export const isPreviewEnabled = (): boolean => {
  // 1. Prefer an explicit opt‑in flag (useful for staged roll‑outs)
  // 2. Vercel Preview Environment
  if (process.env.NEXT_PUBLIC_IS_PREVIEW_BUILD === 'true' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview') {
    return true;
  }
  // 3. Fallback: enable in local dev
  return process.env.NODE_ENV !== 'production';
};
