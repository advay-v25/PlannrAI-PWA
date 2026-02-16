
import * as React from "react"
import { cn } from "@/lib/utils"

// Simple range input as fallback for slider
const Slider = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
    <input
        type="range"
        className={cn(
            "w-full h-2 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]",
            className
        )}
        ref={ref}
        {...props}
    />
))
Slider.displayName = "Slider"

export { Slider }
