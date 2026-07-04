import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClassName, type ButtonVariant, type ButtonSize } from "@/components/ui/button-styles";

type LinkButtonProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/** Link estilizado como botão — evita aninhar `<button>` dentro de `<a>` */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClassName({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
