import React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    
    // Classi base ispirate al dark design premium
    const baseClass = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95";
    
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      destructive: "bg-accent-red text-white hover:bg-accent-red/90",
      outline: "border border-muted bg-transparent hover:bg-card hover:text-white",
      secondary: "bg-card text-white border border-muted hover:bg-muted",
      ghost: "hover:bg-card hover:text-white",
      link: "text-primary underline-offset-4 hover:underline",
      green: "bg-accent-green text-white hover:bg-accent-green/90",
      orange: "bg-accent-orange text-white hover:bg-accent-orange/90",
    };
    
    const sizes = {
      default: "h-12 px-6 py-2", // Altezza 48px perfetta per touch
      sm: "h-9 rounded-md px-3",
      lg: "h-14 rounded-xl px-8 text-lg font-semibold", // Più grande per input principali
      icon: "h-12 w-12",
    };

    // Estendo variants se usano quelli extra
    const selectedVariant = (variants as any)[variant] || variants.default;

    return (
      <button
        ref={ref}
        className={cn(baseClass, selectedVariant, sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
