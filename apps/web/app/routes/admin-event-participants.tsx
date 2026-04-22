import { StatusBadge } from "@qianlu-events/ui";
import { redirect } from "react-router";

import type { Route } from "./+types/admin-event-participants";
import { fetchAdminEvent, fetchAdminParticipants } from "../lib/api.server";
import { buildPageTitle } from "../lib/meta";
import { AdminCard, AdminShell } from "../components/admin-shell";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: buildPageTitle("Participants", params.eventSlug) }];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const [event, participantsReport] = await Promise.all([
      fetchAdminEvent(params.eventSlug, request),
      fetchAdminParticipants(params.eventSlug, request),
    ]);

    return {
      event,
      ...participantsReport,
    };
  } catch {
    return redirect("/admin");
  }
}

export default function AdminEventParticipants({
  loaderData,
}: Route.ComponentProps) {
  const { event, participants } = loaderData;

  return (
    <AdminShell
      description="Review participant sessions, score state, reward eligibility, and task status counts."
      eventSlug={event.slug}
      title={`${event.name} participants`}
    >
      <div className="space-y-4">
        {participants.length > 0 ? (
          participants.map((participant) => (
            <AdminCard key={participant.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold">
                      {participant.name ?? "Unnamed participant"}
                    </h2>
                    <span className="rounded-lg bg-white/80 px-2 py-1 font-display text-sm font-semibold tracking-[0.16em]">
                      {participant.verificationCode}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {participant.email ?? "No email captured"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                    Created {formatDate(participant.createdAt)} - Updated{" "}
                    {formatDate(participant.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    label={`Tier ${participant.rewardTier ?? "none"}`}
                    tone="neutral"
                  />
                  <StatusBadge
                    label={
                      participant.instantRewardEligible
                        ? "Instant eligible"
                        : "Instant locked"
                    }
                    tone={
                      participant.instantRewardEligible ? "verified" : "neutral"
                    }
                  />
                  <StatusBadge
                    label={
                      participant.dailyDrawEligible
                        ? "Raffle active"
                        : "Raffle locked"
                    }
                    tone={participant.dailyDrawEligible ? "verified" : "neutral"}
                  />
                </div>
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Claimed points
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-semibold">
                    {participant.claimedPoints}
                  </dd>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Verified points
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-semibold">
                    {participant.verifiedPoints}
                  </dd>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Verified tasks
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-semibold">
                    {participant.statusCounts.VERIFIED}
                  </dd>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Pending tasks
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-semibold">
                    {participant.statusCounts.PENDING_STAFF_CHECK +
                      participant.statusCounts.PENDING_AUTO_VERIFICATION +
                      participant.statusCounts.COMPLETED_BY_USER}
                  </dd>
                </div>
              </dl>
            </AdminCard>
          ))
        ) : (
          <AdminCard>
            <p className="text-sm text-slate-700">
              No participant sessions have been created yet.
            </p>
          </AdminCard>
        )}
      </div>
    </AdminShell>
  );
}
