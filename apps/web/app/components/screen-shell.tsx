import type { CSSProperties, ReactNode } from "react";

type ScreenShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  style?: CSSProperties;
  width?: "default" | "wide";
};

export function ScreenShell({
  eyebrow,
  title,
  description,
  children,
  style,
  width = "default",
}: ScreenShellProps) {
  return (
    <main
      className={`mx-auto flex min-h-screen w-full flex-col px-5 py-8 ${
        width === "wide" ? "max-w-3xl" : "max-w-md"
      }`}
      style={style}
    >
      <div className="flex-1">
        <header className="space-y-4">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-primary)]">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-balance text-[var(--color-text)]">
              {title}
            </h1>
            <p className="max-w-sm text-sm leading-6 text-[color:color-mix(in_srgb,var(--color-text)_74%,white)]">
              {description}
            </p>
          </div>
        </header>

        <section className="mt-8">{children}</section>
      </div>
    </main>
  );
}
