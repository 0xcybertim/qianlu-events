import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "ghost";
};

const toneClasses: Record<NonNullable<ButtonProps["tone"]>, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-[0_16px_40px_-24px_var(--color-primary)]",
  secondary:
    "bg-[var(--color-surface-strong)] text-[var(--color-text)] border border-[var(--color-border)]",
  ghost: "bg-transparent text-[var(--color-text)] border border-transparent",
};

export function Button({
  children,
  className = "",
  tone = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses[tone]} ${className}`.trim()}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

