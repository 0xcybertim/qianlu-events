import type { CSSProperties, ReactNode } from "react";

import { ParticipantMarketing } from "./participant-marketing";
import type { ParticipantMarketingConfig } from "../lib/marketing";

type ScreenShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  fixedHeader?: ReactNode;
  marketing?: ParticipantMarketingConfig;
  topContent?: ReactNode;
  style?: CSSProperties;
  width?: "default" | "wide";
};

export function ScreenShell({
  eyebrow,
  title,
  description,
  children,
  fixedHeader,
  marketing,
  style,
  topContent,
  width = "default",
}: ScreenShellProps) {
  return (
    <main
      className={`mx-auto flex min-h-screen w-full flex-col px-5 pb-8 ${
        width === "wide" ? "max-w-3xl" : "max-w-md"
      } ${fixedHeader ? "pt-24" : "pt-8"}`}
      style={style}
    >
      {fixedHeader ? (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-surface-strong)_96%,white)] px-5 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] shadow-[0_16px_42px_-32px_rgba(15,109,83,0.45)] backdrop-blur">
          <div
            className={`mx-auto flex w-full items-center ${
              width === "wide" ? "max-w-3xl" : "max-w-md"
            }`}
          >
            {fixedHeader}
          </div>
        </div>
      ) : null}
      {topContent}
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
      {marketing ? <ParticipantMarketing config={marketing} /> : null}
    </main>
  );
}
