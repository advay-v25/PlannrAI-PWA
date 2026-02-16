
import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

// A simplified Select that uses native select for reliability without complex Headless UI setup
interface SelectProps {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
}

const SelectContext = React.createContext<SelectProps>({ value: '', onValueChange: () => { }, children: null });

const Select = ({ value, onValueChange, children }: SelectProps) => {
    return (
        <SelectContext.Provider value={{ value, onValueChange, children }}>
            {children}
        </SelectContext.Provider>
    )
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, children, ...props }, ref) => {
    return (
        <div className="relative">
            <div className={cn(
                "flex h-10 w-full items-center justify-between rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}>
                {children}
                <ChevronDown className="h-4 w-4 opacity-50" />
            </div>
            {/* Invisible native select overlay for functionality */}
            <select
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                // @ts-ignore - Context consumption happen in parent but for this simple mock we trigger change from here
                onChange={(e) => {
                    // Find the context consumer approach or just hack it:
                    // This simple composition is tricky.
                    // Better approach: Pass props down or use children inspection.
                }}
            >
                {/* Options would go here */}
            </select>
        </div>
    )
})
SelectTrigger.displayName = "SelectTrigger"

// Better Strategy: Just map the components to props for a Native Select wrapper
// The usage in my components is:
// <Select value={...} onValueChange={...}>
//    <SelectTrigger><SelectValue /></SelectTrigger>
//    <SelectContent><SelectItem value="...">...</SelectItem></SelectContent>
// </Select>

// Let's implement a version that renders a native select but LOOKS custom.

const SelectValue = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => {
    // In a real implementation this displays the selected label.
    // For this mock, let's just render children or "Select..."
    return <span ref={ref} className={className} {...props} />
})
SelectValue.displayName = "SelectValue"


const CustomSelect = ({ value, onValueChange, children }: SelectProps) => {
    // Extract items from children to build options list
    const [options, setOptions] = React.useState<{ value: string, label: string }[]>([]);

    // This is a bit hacker-ish for React children, but reliable for a "drop-in" replacement without installing deps
    React.useEffect(() => {
        const extracted: { value: string, label: string }[] = [];
        const traverse = (node: any) => {
            if (!node) return;
            if (node.type?.displayName === 'SelectContent' || node.props?.children) {
                React.Children.forEach(node.props.children, child => traverse(child));
            }
            if (node.type?.displayName === 'SelectItem') {
                extracted.push({ value: node.props.value, label: node.props.children });
            }
        }
        React.Children.forEach(children, traverse);
        setOptions(extracted);
    }, [children]);

    const selectedLabel = options.find(o => o.value === value)?.label || value;

    return (
        <div className="relative group w-full">
            <div className="flex h-10 w-full items-center justify-between rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-sm text-[var(--text-primary)]">
                <span className="truncate">{selectedLabel || "Select..."}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
            </div>
            <select
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={value}
                onChange={(e) => onValueChange?.(e.target.value)}
            >
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            {/* Render children hidden to allow extraction logic to work if it relied on mounting */}
            <div className="hidden">{children}</div>
        </div>
    );
}

const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
(SelectContent as any).displayName = "SelectContent";

const SelectItem = ({ value, children }: { value: string, children: React.ReactNode }) => <option value={value}>{children}</option>;
(SelectItem as any).displayName = "SelectItem";

export { CustomSelect as Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
