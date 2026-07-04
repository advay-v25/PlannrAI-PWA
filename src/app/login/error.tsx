'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("LOGIN PAGE CRASHED:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen min-h-dvh text-white bg-red-900/50 relative z-50">
      <h2 className="text-xl font-bold mb-4">Something went wrong!</h2>
      <pre className="text-sm bg-black/50 p-4 rounded max-w-2xl overflow-auto">
        {error.message}
      </pre>
      <pre className="text-xs bg-black/50 p-4 rounded mt-4 max-w-2xl overflow-auto text-red-300">
        {error.stack}
      </pre>
      <button
        onClick={() => reset()}
        className="mt-6 px-4 py-2 bg-white text-black rounded"
      >
        Try again
      </button>
    </div>
  );
}
