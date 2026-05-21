'use client';

import { motion } from 'framer-motion';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ 
        duration: 0.7, 
        ease: [0.22, 1, 0.36, 1], // Smooth liquid ease
      }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}
