import { forwardRef, ButtonHTMLAttributes } from "react";
import { buttonClassName, type ButtonVariant, type ButtonSize } from "@/components/ui/button-styles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonClassName({ variant, size, className })}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
