import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const glassButtonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
    {
        variants: {
            variant: {
                default: "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-highlight)] shadow-sm backdrop-blur-md",
                primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 shadow-[0_0_20px_rgba(255,77,0,0.3)] hover:shadow-[0_0_30px_rgba(255,77,0,0.5)] border border-[var(--color-primary)]/50",
                ghost: "hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                glow: "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-primary)] shadow-[0_0_15px_rgba(255,77,0,0.1)] hover:shadow-[0_0_25px_rgba(255,77,0,0.2)] hover:border-[var(--color-primary)]/30",
                danger: "bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 hover:border-red-500/40",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-lg px-3",
                lg: "h-12 rounded-xl px-8 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

interface GlassButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
    asChild?: boolean
    loading?: boolean
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, children, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(glassButtonVariants({ variant, size, className }))}
                ref={ref}
                disabled={props.disabled || loading}
                {...props}
            >
                {loading && (
                    <svg
                        className="mr-2 h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                )}
                {children}
            </Comp>
        )
    }
)
GlassButton.displayName = "GlassButton"

export { GlassButton, glassButtonVariants }
