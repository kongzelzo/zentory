import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: ReactNode;
};

export function Button({ className, variant = "primary", icon, children, ...props }: Props) {
  const variants = {
    primary: "bg-leaf text-white hover:bg-teal-800",
    secondary: "bg-white text-ink border border-stone-300 hover:bg-stone-50",
    ghost: "bg-transparent text-ink hover:bg-stone-100",
    danger: "bg-red-700 text-white hover:bg-red-800"
  };
  return (
    <button
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
