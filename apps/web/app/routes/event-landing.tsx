import { Link } from "react-router";

import type { Route } from "./+types/event-landing";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getRewardTiers } from "../lib/experience";
import { ScreenShell } from "../components/screen-shell";

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function meta({ params }: Route.MetaArgs) {
  const name = humanizeSlug(params.eventSlug ?? "event");

  return [{ title: `${name} | Qianlu Events` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export default function EventLanding({ loaderData, params }: Route.ComponentProps) {
  const eventName = loaderData.event.name || humanizeSlug(params.eventSlug);
  const rewardTiers = getRewardTiers(loaderData);
  const themeStyle = getBrandingStyle(loaderData);

  return (
    <ScreenShell
      eyebrow="Scan. Complete. Show. Win."
      title={eventName}
      description="Visitors complete social and lead tasks, collect points, and show this experience to staff for reward verification."
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Reward structure
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold">
                Earn points across socials, leads, and booth tasks
              </h2>
            </div>
            <span className="rounded-full bg-[var(--color-secondary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-900">
              Live event
            </span>
          </div>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
            <li>{loaderData.event.tasks.length} active tasks configured for this event</li>
            <li>
              {rewardTiers.length > 0
                ? `Reward tiers start at ${rewardTiers[0]?.threshold} points`
                : "Reward tiers will be configured per event"}
            </li>
            <li>Participant session: {loaderData.session ? "ready" : "not started"}</li>
            <li>Instant rewards still require staff verification</li>
          </ul>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Reward levels
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {rewardTiers.length > 0 ? rewardTiers.map((tier) => tier.threshold).join(" / ") : "Set per event"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Event code
              </p>
              <p className="mt-2 text-sm font-medium uppercase tracking-[0.18em] text-slate-900">
                {loaderData.event.slug}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <Link className="action-link action-link-primary" to={`/${params.eventSlug}/tasks`}>
              Start tasks
            </Link>
            <Link className="action-link action-link-secondary" to={`/${params.eventSlug}/scan`}>
              Scan stamp QR
            </Link>
            <Link className="action-link action-link-secondary" to={`/${params.eventSlug}/summary`}>
              Preview summary screen
            </Link>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}
