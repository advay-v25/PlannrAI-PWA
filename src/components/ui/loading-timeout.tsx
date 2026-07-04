'use client';
import { useState, useEffect } from 'react';

export function LoadingTimeout({ children, delayMs = 250 }: { children: React.ReactNode, delayMs?: number }) {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  
  if (!show) return null;
  return <>{children}</>;
}
