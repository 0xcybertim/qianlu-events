import { StatusBadge } from "@qianlu-events/ui";
import { redirect } from "react-router";

import type { Route } from "./+types/admin-event-rewards";
import { fetchAdminEvent, fetchAdminRewards } from "../lib/api.server";
import { AdminCard, AdminShell } from "../components/admin-shell";

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const [event, rewards] = await Promise.all([
      fetchAdminEvent(params.eventSlug, request),
      fetchAdminRewards(params.eventSlug, request),
    ]);

    return {
      event,
      rewards,
    };
  } catch {
    return redirect("/admin");
  }
}

export default function AdminEventRewards({ loaderData }: Route.ComponentProps) {
  const { event, rewards } = loaderData;

  return (
    <AdminShell
      description="Review instant reward, tier reward, and daily draw eligibility."
      eventSlug={event.slug}
      title={`${event.name} rewards`}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminCard>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Instant reward eligible
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {rewards.instantRewardEligibleCount}
            </p>
          </AdminCard>
          <AdminCard>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Daily draw eligible
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {rewards.dailyDrawEligibleCount}
            </p>
          </AdminCard>
        </div>

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">Tier counts</h2>
          {rewards.tierCounts.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {rewards.tierCounts.map((tier) => (
                <div
                  className="grid gap-3 rounded-lg bg-white/70 p-4 sm:grid-cols-[1fr_8rem_8rem]"
                  key={tier.key}
                >
                  <div>
                    <p className="font-semibold">{tier.label}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {tier.threshold} points
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Claimed
                    </p>
                    <p className="mt-1 font-display text-2xl font-semibold">
                      {tier.claimedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Verified
                    </p>
                    <p className="mt-1 font-display text-2xl font-semibold">
                      {tier.verifiedCount}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              No reward tiers configured.
            </p>
          )}
        </AdminCard>

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">
            Daily draw eligible participants
          </h2>
          <div className="mt-4 grid gap-3">
            {rewards.eligibleParticipants.dailyDraw.length > 0 ? (
              rewards.eligibleParticipants.dailyDraw.map((participant) => (
                <div
                  className="flex flex-col gap-2 rounded-lg bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={participant.id}
                >
                  <div>
                    <p className="font-semibold">
                      {participant.name ?? "Unnamed participant"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {participant.email ?? "No email"} -{" "}
                      {participant.verificationCode}
                    </p>
                  </div>
                  <StatusBadge
                    label={`${participant.verifiedPoints} verified pts`}
                    tone="verified"
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-700">
                No participants are daily draw eligible yet.
              </p>
            )}
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}

