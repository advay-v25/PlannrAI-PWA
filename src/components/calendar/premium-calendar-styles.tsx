import { create } from 'zustand';

export interface PremiumCalendarState {
  hoveredBlock: string | null;
  draggedBlock: string | null;
  selectedDay: string | null;
  selectedTime: number | null;
  currentView: 'day' | 'week' | 'month';
  zoomLevel: number;
  isAnimating: boolean;
  
  setHoveredBlock: (id: string | null) => void;
  setDraggedBlock: (id: string | null) => void;
  setSelectedDay: (day: string | null) => void;
  setSelectedTime: (time: number | null) => void;
  setCurrentView: (view: 'day' | 'week' | 'month') => void;
  setZoomLevel: (level: number) => void;
  setIsAnimating: (animating: boolean) => void;
  resetPreview: () => void;
}

export const usePremiumCalendar = create<PremiumCalendarState>((set) => ({
  hoveredBlock: null,
  draggedBlock: null,
  selectedDay: null,
  selectedTime: null,
  currentView: 'week',
  zoomLevel: 1.0,
  isAnimating: false,
  
  setHoveredBlock: (id) => set({ hoveredBlock: id }),
  setDraggedBlock: (id) => set({ draggedBlock: id }),
  setSelectedDay: (day) => set({ selectedDay: day }),
  setSelectedTime: (time) => set({ selectedTime: time }),
  setCurrentView: (view) => set({ currentView: view }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  resetPreview: () => set({ hoveredBlock: null, selectedDay: null, selectedTime: null }),
}));

export const calendarAnimationVariants = {
  block: {
    initial: { opacity: 0, scale: 0.95, y: 5 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 30 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
    hover: { scale: 1.02, transition: { type: "spring", stiffness: 200, damping: 20 } },
    active: { scale: 0.98 },
    dragging: { scale: 1.05, zIndex: 50, filter: "brightness(1.1)", transition: { duration: 0.1 } },
  },
  list: {
    item: (i: number) => ({
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0, transition: { delay: i * 0.05, type: "spring", stiffness: 300, damping: 30 } },
      exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
    }),
  },
  timeMarker: {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 200, damping: 20 } },
    update: { scale: [1, 1.2, 1], transition: { duration: 0.3 } },
  },
  hoverGlow: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 150, damping: 15 } },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
  },
};

export const getPremiumBlockColors = (block: any) => {
  const pillar = (block.pillar || block.goal?.pillar || block.block_type || 'default').toLowerCase();
  
  const gradients = {
    mind: {
      bg: "bg-gradient-to-br from-[var(--color-mind)]/20 via-[var(--color-mind)]/15 to-transparent",
      border: "border-[var(--color-mind)]/40",
      text: "text-[var(--color-mind)]/90",
      accent: "from-[var(--color-mind)] to-[var(--color-mind)]/70",
    },
    body: {
      bg: "bg-gradient-to-br from-[var(--color-body)]/20 via-[var(--color-body)]/15 to-transparent",
      border: "border-[var(--color-body)]/40",
      text: "text-[var(--color-body)]/90",
      accent: "from-[var(--color-body)] to-[var(--color-body)]/70",
    },
    craft: {
      bg: "bg-gradient-to-br from-[var(--color-craft)]/20 via-[var(--color-craft)]/15 to-transparent",
      border: "border-[var(--color-craft)]/40",
      text: "text-[var(--color-craft)]/90",
      accent: "from-[var(--color-craft)] to-[var(--color-craft)]/70",
    },
    anchor: {
      bg: "bg-gradient-to-br from-[var(--color-anchor)]/20 via-[var(--color-anchor)]/15 to-transparent",
      border: "border-[var(--color-anchor)]/40",
      text: "text-[var(--color-anchor)]/90",
      accent: "from-[var(--color-anchor)] to-[var(--color-anchor)]/70",
    },
    meal: {
      bg: "bg-gradient-to-br from-[var(--color-primary)]/15 via-[var(--color-primary)]/10 to-transparent",
      border: "border-[var(--color-primary)]/30",
      text: "text-[var(--color-primary)]/90",
      accent: "from-[var(--color-primary)] to-[var(--color-primary)]/70",
    },
    sleep: {
      bg: "bg-gradient-to-br from-black/40 via-zinc-900/30 to-transparent",
      border: "border-white/[0.05]",
      text: "text-white/60",
      accent: "from-zinc-700 to-zinc-500",
    },
    break: {
      bg: "bg-gradient-to-br from-white/5 via-white/3 to-transparent",
      border: "border-white/[0.08]",
      text: "text-white/50",
      accent: "from-white/20 to-white/10",
    },
    routine: {
      bg: "bg-gradient-to-br from-[var(--color-routine)]/20 via-[var(--color-routine)]/15 to-transparent",
      border: "border-[var(--color-routine)]/40",
      text: "text-[var(--color-routine)]/90",
      accent: "from-[var(--color-routine)] to-[var(--color-routine)]/70",
    },
    default: {
      bg: "bg-gradient-to-br from-white/10 via-white/7 to-transparent",
      border: "border-white/[0.08]",
      text: "text-white/80",
      accent: "from-white/30 to-white/20",
    },
  };
  
  return gradients[pillar] || gradients.default;
};

export const getStatusStyles = (status: string) => {
  const styles = {
    done: {
      container: "opacity-80 scale-[0.995]",
      indicator: "bg-emerald-400",
      text: "line-through opacity-60",
      animation: "animate-pulse",
    },
    missed: {
      container: "opacity-60 scale-[0.99]",
      indicator: "bg-rose-400",
      text: "line-through opacity-40",
      animation: "animate-pulse",
    },
    cancelled: {
      container: "opacity-50 scale-[0.98]",
      indicator: "bg-zinc-500",
      text: "line-through opacity-30",
      animation: "",
    },
    in_progress: {
      container: "ring-2 ring-emerald-400/30 shadow-emerald-400/10 shadow-lg",
      indicator: "bg-orange-500 animate-pulse",
      text: "font-semibold",
      animation: "animate-pulse",
    },
    upcoming: {
      container: "scale-[1.01]",
      indicator: "bg-blue-400",
      text: "",
      animation: "",
    },
  };
  
  return styles[status] || { container: "", indicator: "", text: "", animation: "" };
};

export const interpolateTimeProgress = (startTime: string, endTime: string): number => {
  const now = new Date();
  const start = new Date(`${now.toDateString()} ${startTime}`);
  const end = new Date(`${now.toDateString()} ${endTime}`);
  
  if (now < start) return 0;
  if (now > end) return 100;
  
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  return Math.round((elapsed / total) * 100);
};

export const useKeyboardShortcuts = (shortcuts: Record<string, () => void>) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`;
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
};

export const useSwipeGestures = ({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
}) => {
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const onTouchStart = (e: TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setStartY(e.touches[0].clientY);
    setIsSwiping(true);
  };
  
  const onTouchEnd = (e: TouchEvent) => {
    if (!isSwiping) return;
    
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = startX - endX;
    const deltaY = startY - endY;
    
    // Only register horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
    }
    
    setIsSwiping(false);
  };
  
  return {
    onTouchStart,
    onTouchEnd,
    isSwiping,
  };
};