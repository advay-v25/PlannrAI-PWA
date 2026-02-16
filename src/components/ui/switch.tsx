
import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

// Simple mock switch if radix is missing, or wrap it.
// To be safe and fast, I'll build a custom simple switch without radix dependency issues for now.
const Switch = React.forwardRef<
    HTMLButtonElement,
    { checked?: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean; className?: string }
>(({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        ref={ref}
        className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "bg-[var(--color-primary)]" : "bg-[var(--glass-border)]",
            className
        )}
        {...props}
    >
        <span
            className={cn(
                "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                checked ? "translate-x-5" : "translate-x-0"
            )}
        />
    </button>
))
Switch.displayName = "Switch"

export { Switch }
