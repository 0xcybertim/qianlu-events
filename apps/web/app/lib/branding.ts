import type { CSSProperties } from "react";

import type { ExperienceResponse } from "@qianlu-events/schemas";

export function getBrandingStyle(experience: ExperienceResponse): CSSProperties | undefined {
  const branding = experience.event.brandingJson;

  if (!branding) {
    return undefined;
  }

  return {
    ["--color-primary" as string]: branding.primary,
    ["--color-primary-contrast" as string]: branding.primaryContrast,
    ["--color-secondary" as string]: branding.secondary,
    ["--color-surface" as string]: branding.surface,
    ["--color-surface-strong" as string]: branding.surfaceStrong,
    ["--color-text" as string]: branding.text,
    ["--color-border" as string]: branding.border,
  };
}
