export const isPreviewEnabled = (): boolean => {
  // 1. Prefer an explicit opt‑in flag (useful for staged roll‑outs)
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_IS_PREVIEW_BUILD) {
    return process.env.NEXT_PUBLIC_IS_PREVIEW_BUILD === 'true';
  }
  // 2. Fallback: enable in any non‑production build (dev, preview, test)
  return process.env.NODE_ENV !== 'production';
};
