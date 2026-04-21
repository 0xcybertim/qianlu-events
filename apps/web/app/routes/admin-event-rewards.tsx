import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, redirect } from "react-router";

import type { Route } from "./+types/admin-event-rewards";
import {
  fetchAdminEvent,
  fetchAdminRewards,
  updateAdminEvent,
} from "../lib/api.server";
import {
  AdminCard,
  AdminShell,
  adminInputClass,
} from "../components/admin-shell";

function parseRewardTiers(formData: FormData) {
  const keys = formData.getAll("tierKey").map((value) => value.toString().trim());
  const labels = formData
    .getAll("tierLabel")
    .map((value) => value.toString().trim());
  const descriptions = formData
    .getAll("tierDescription")
    .map((value) => value.toString().trim());
  const thresholds = formData
    .getAll("tierThreshold")
    .map((value) => Number(value.toString()));

  return keys
    .map((key, index) => ({
      key,
      label: labels[index] ?? "",
      ...(descriptions[index] ? { description: descriptions[index] } : {}),
      threshold: thresholds[index] ?? 0,
    }))
    .filter((tier) => tier.key && tier.label && Number.isFinite(tier.threshold));
}

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

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();

  try {
    const currentEvent = await fetchAdminEvent(params.eventSlug, request);

    await updateAdminEvent(
      params.eventSlug,
      {
        settingsJson: {
          marketing: currentEvent.settingsJson?.marketing,
          participantMessaging: currentEvent.settingsJson?.participantMessaging,
          rewardTypes: currentEvent.settingsJson?.rewardTypes ?? [],
          rewardTiers: parseRewardTiers(formData),
        },
      },
      request,
    );

    return {
      success: "Reward tiers saved.",
    };
  } catch {
    return {
      error: "Could not save reward tiers.",
    };
  }
}

export default function AdminEventRewards({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const { event, rewards } = loaderData;
  const tiers = [
    ...(event.settingsJson?.rewardTiers ?? []),
    {
      description: "",
      key: "",
      label: "",
      threshold: 0,
    },
  ];

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
          <h2 className="font-display text-xl font-semibold">
            Edit reward tiers
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Configure the reward name, point threshold, and participant-facing
            description.
          </p>
          <Form
            action={`/admin/events/${event.slug}/rewards`}
            className="mt-4 space-y-3"
            method="post"
          >
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white/70">
              <div className="grid min-w-[54rem] grid-cols-[10rem_14rem_7rem_1fr] border-b border-[var(--color-border)] bg-white/80">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Key
                </div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Reward name
                </div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Points
                </div>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Description
                </div>
              </div>
              {tiers.map((tier, index) => (
                <div
                  className="grid min-w-[54rem] grid-cols-[10rem_14rem_7rem_1fr] gap-2 border-b border-[var(--color-border)] p-3 last:border-b-0"
                  key={index}
                >
                  <input
                    className={adminInputClass}
                    defaultValue={tier.key}
                    name="tierKey"
                    placeholder="starter"
                  />
                  <input
                    className={adminInputClass}
                    defaultValue={tier.label}
                    name="tierLabel"
                    placeholder="Starter reward"
                  />
                  <input
                    className={adminInputClass}
                    defaultValue={tier.threshold}
                    min={0}
                    name="tierThreshold"
                    type="number"
                  />
                  <textarea
                    className={`${adminInputClass} min-h-16`}
                    defaultValue={tier.description ?? ""}
                    name="tierDescription"
                    placeholder="What the participant unlocks"
                  />
                </div>
              ))}
            </div>
            {actionData && "error" in actionData ? (
              <p className="text-sm font-medium text-rose-700">
                {actionData.error}
              </p>
            ) : null}
            {actionData && "success" in actionData ? (
              <p className="text-sm font-medium text-emerald-700">
                {actionData.success}
              </p>
            ) : null}
            <Button type="submit">Save reward tiers</Button>
          </Form>
        </AdminCard>

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
                    {tier.description ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {tier.description}
                      </p>
                    ) : null}
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
