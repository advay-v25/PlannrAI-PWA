export default function Template({ children }: { children: React.ReactNode }) {
  // We cannot use Framer Motion here because motion.div creates a CSS Containing Block 
  // (due to internal transform optimizations), which completely breaks position: fixed 
  // full-screen backgrounds inside individual pages, causing them to clip and scroll.
  return <>{children}</>;
}
