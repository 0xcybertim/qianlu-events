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
  AdminField,
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

function parseInstantRewards(formData: FormData) {
  const keys = formData
    .getAll("instantRewardKey")
    .map((value) => value.toString().trim());
  const labels = formData
    .getAll("instantRewardLabel")
    .map((value) => value.toString().trim());
  const descriptions = formData
    .getAll("instantRewardDescription")
    .map((value) => value.toString().trim());
  const matchModes = formData
    .getAll("instantRewardMatchMode")
    .map((value) => value.toString());

  return keys
    .map((key, index) => ({
      key,
      label: labels[index] ?? "",
      ...(descriptions[index] ? { description: descriptions[index] } : {}),
      taskIds: formData
        .getAll(`instantRewardTaskIds:${index}`)
        .map((value) => value.toString())
        .filter(Boolean),
      taskMatchMode: matchModes[index] === "ALL" ? "ALL" : "ANY",
    }))
    .filter((reward) => reward.key && reward.label);
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
          instantRewards: parseInstantRewards(formData),
        },
      },
      request,
    );

    return {
      success: "Rewards saved.",
    };
  } catch {
    return {
      error: "Could not save rewards.",
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
  const instantRewards = [
    ...(event.settingsJson?.instantRewards ?? []),
    {
      description: "",
      key: "",
      label: "",
      taskIds: [],
      taskMatchMode: "ANY" as const,
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
            Reward configuration
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Define point tiers and task-linked instant rewards here. Instant
            rewards can unlock when any linked task is done or only when all linked
            tasks are done.
          </p>
          <Form
            action={`/admin/events/${event.slug}/rewards`}
            className="mt-4 space-y-6"
            method="post"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Reward tiers
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white/70">
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
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Instant rewards
              </p>
              <div className="mt-3 grid gap-4">
                {instantRewards.map((reward, index) => (
                  <div
                    className="rounded-lg border border-[var(--color-border)] bg-white/70 p-4"
                    key={`${reward.key || "new"}-${index}`}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AdminField label="Reward key">
                        <input
                          className={adminInputClass}
                          defaultValue={reward.key}
                          name="instantRewardKey"
                          placeholder="darts-throw"
                        />
                      </AdminField>
                      <AdminField label="Reward label">
                        <input
                          className={adminInputClass}
                          defaultValue={reward.label}
                          name="instantRewardLabel"
                          placeholder="Darts throw"
                        />
                      </AdminField>
                      <AdminField label="Unlock rule">
                        <select
                          className={adminInputClass}
                          defaultValue={reward.taskMatchMode}
                          name="instantRewardMatchMode"
                        >
                          <option value="ANY">Any linked task</option>
                          <option value="ALL">All linked tasks</option>
                        </select>
                      </AdminField>
                      <AdminField label="Description">
                        <input
                          className={adminInputClass}
                          defaultValue={reward.description ?? ""}
                          name="instantRewardDescription"
                          placeholder="Show this reward at the booth."
                        />
                      </AdminField>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Linked tasks
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {event.tasks.map((task) => (
                          <label
                            className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2"
                            key={`${reward.key || "new"}-${task.id}`}
                          >
                            <input
                              defaultChecked={reward.taskIds.includes(task.id)}
                              name={`instantRewardTaskIds:${index}`}
                              type="checkbox"
                              value={task.id}
                            />
                            <span className="text-sm leading-6 text-slate-700">
                              <span className="font-medium text-slate-900">
                                {task.title}
                              </span>
                              <br />
                              {task.type}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
            <Button type="submit">Save rewards</Button>
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
            Instant reward breakdown
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Review which configured instant rewards are being claimed and verified.
          </p>
          {rewards.taskInstantRewards.length > 0 ? (
            <div className="mt-4 grid gap-4">
              {rewards.taskInstantRewards.map((reward) => (
                <div
                  className="rounded-lg bg-white/70 p-4"
                  key={reward.rewardKey}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{reward.label}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {reward.taskMatchMode === "ALL" ? "All of" : "Any of"}{" "}
                        {reward.linkedTasks.length > 0
                          ? reward.linkedTasks.map((task) => task.title).join(", ")
                          : "no tasks linked yet"}
                      </p>
                      {reward.description ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {reward.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-48">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Claimed
                        </p>
                        <p className="mt-1 font-display text-2xl font-semibold">
                          {reward.eligibleCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Verified
                        </p>
                        <p className="mt-1 font-display text-2xl font-semibold">
                          {reward.verifiedCount}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Eligible participants
                      </p>
                      <div className="mt-3 grid gap-2">
                        {reward.eligibleParticipants.length > 0 ? (
                          reward.eligibleParticipants.map((participant) => (
                            <div
                              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2"
                              key={`${reward.rewardKey}-${participant.id}-eligible`}
                            >
                              <div>
                                <p className="font-medium">
                                  {participant.name ?? "Unnamed participant"}
                                </p>
                                <p className="text-sm text-slate-600">
                                  {participant.verificationCode}
                                </p>
                              </div>
                              <StatusBadge label="Claimed" tone="claimed" />
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-700">
                            No participants have claimed this reward yet.
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Verified participants
                      </p>
                      <div className="mt-3 grid gap-2">
                        {reward.verifiedParticipants.length > 0 ? (
                          reward.verifiedParticipants.map((participant) => (
                            <div
                              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2"
                              key={`${reward.rewardKey}-${participant.id}-verified`}
                            >
                              <div>
                                <p className="font-medium">
                                  {participant.name ?? "Unnamed participant"}
                                </p>
                                <p className="text-sm text-slate-600">
                                  {participant.verificationCode}
                                </p>
                              </div>
                              <StatusBadge label="Verified" tone="verified" />
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-700">
                            No verified participants for this reward yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              No configured instant rewards yet.
            </p>
          )}
        </AdminCard>

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">
            Instant reward eligible participants
          </h2>
          <div className="mt-4 grid gap-3">
            {rewards.eligibleParticipants.instantReward.length > 0 ? (
              rewards.eligibleParticipants.instantReward.map((participant) => (
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
                  <StatusBadge label="Instant reward ready" tone="verified" />
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-700">
                No participants are instant reward eligible yet.
              </p>
            )}
          </div>
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
