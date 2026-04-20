import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/admin-event";
import { fetchAdminEvent, updateAdminEvent } from "../lib/api.server";
import { getParticipantContactBannerText } from "../lib/experience";
import {
  AdminCard,
  AdminField,
  AdminShell,
  adminInputClass,
} from "../components/admin-shell";

const eventStatuses = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const rewardTypes = [
  { label: "Instant reward", value: "INSTANT_REWARD" },
  { label: "Tiered reward", value: "TIERED_REWARD" },
  { label: "Daily prize draw", value: "DAILY_PRIZE_DRAW" },
] as const;
const brandingFields = [
  ["primary", "Primary"],
  ["primaryContrast", "Primary contrast"],
  ["secondary", "Secondary"],
  ["surface", "Surface"],
  ["surfaceStrong", "Surface strong"],
  ["text", "Text"],
  ["border", "Border"],
] as const;

function parseRewardTiers(formData: FormData) {
  const keys = formData.getAll("tierKey").map((value) => value.toString().trim());
  const labels = formData
    .getAll("tierLabel")
    .map((value) => value.toString().trim());
  const thresholds = formData
    .getAll("tierThreshold")
    .map((value) => Number(value.toString()));

  return keys
    .map((key, index) => ({
      key,
      label: labels[index] ?? "",
      threshold: thresholds[index] ?? 0,
    }))
    .filter((tier) => tier.key && tier.label && Number.isFinite(tier.threshold));
}

function parseParticipantMessaging(formData: FormData) {
  const saveProgressMessage =
    formData.get("saveProgressMessage")?.toString().trim() ?? "";
  const prizeDrawLabel = formData.get("prizeDrawLabel")?.toString().trim() ?? "";
  const laterPrizeLabel =
    formData.get("laterPrizeLabel")?.toString().trim() ?? "";

  if (!saveProgressMessage && !prizeDrawLabel && !laterPrizeLabel) {
    return undefined;
  }

  return {
    ...(saveProgressMessage ? { saveProgressMessage } : {}),
    ...(prizeDrawLabel ? { prizeDrawLabel } : {}),
    ...(laterPrizeLabel ? { laterPrizeLabel } : {}),
  };
}

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    return fetchAdminEvent(params.eventSlug, request);
  } catch {
    return redirect("/admin");
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const brandingJson = Object.fromEntries(
    brandingFields.map(([key]) => [
      key,
      formData.get(key)?.toString().trim() ?? "",
    ]),
  );

  try {
    const currentEvent = await fetchAdminEvent(params.eventSlug, request);

    await updateAdminEvent(
      params.eventSlug,
      {
        name: formData.get("name")?.toString() ?? "",
        status: formData.get("status")?.toString() ?? "DRAFT",
        brandingJson,
        settingsJson: {
          marketing: currentEvent.settingsJson?.marketing,
          rewardTypes: formData
            .getAll("rewardTypes")
            .map((value) => value.toString()),
          rewardTiers: parseRewardTiers(formData),
          participantMessaging: parseParticipantMessaging(formData),
        },
      },
      request,
    );

    return {
      success: "Event settings saved.",
    };
  } catch {
    return {
      error: "Could not save event settings.",
    };
  }
}

export default function AdminEvent({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const event = loaderData;
  const branding = event.brandingJson;
  const settings = event.settingsJson;
  const participantMessaging = settings?.participantMessaging;
  const tiers = [...(settings?.rewardTiers ?? []), {
    key: "",
    label: "",
    threshold: 0,
  }];
  const participantBannerPreview = getParticipantContactBannerText(settings);

  return (
    <AdminShell
      description="Edit the basic event setup and review the current operational snapshot."
      eventSlug={event.slug}
      title={event.name}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <AdminCard>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Tasks
              </p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {event.tasks.length}
              </p>
            </AdminCard>
            <AdminCard>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Participants
              </p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {event.participantCount}
              </p>
            </AdminCard>
            <AdminCard>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Leads
              </p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {event.leadCount}
              </p>
            </AdminCard>
          </div>

          <AdminCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  Event overview
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Participant route: /{event.slug}
                </p>
              </div>
              <StatusBadge label={event.status} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="action-link action-link-primary rounded-lg"
                to={`/${event.slug}`}
              >
                Open participant flow
              </Link>
              <Link
                className="action-link action-link-secondary rounded-lg"
                to={`/${event.slug}/staff`}
              >
                Open staff panel
              </Link>
            </div>
          </AdminCard>
        </div>

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">Event settings</h2>
          <Form className="mt-4 space-y-4" method="post">
            <AdminField label="Event name">
              <input
                className={adminInputClass}
                defaultValue={event.name}
                name="name"
                required
              />
            </AdminField>
            <AdminField label="Status">
              <select
                className={adminInputClass}
                defaultValue={event.status}
                name="status"
              >
                {eventStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </AdminField>

            <div className="grid grid-cols-2 gap-3">
              {brandingFields.map(([key, label]) => (
                <AdminField key={key} label={label}>
                  <input
                    className={`${adminInputClass} h-11`}
                    defaultValue={branding?.[key] ?? ""}
                    name={key}
                    type="color"
                  />
                </AdminField>
              ))}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                Reward types
              </legend>
              {rewardTypes.map((rewardType) => (
                <label
                  className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm"
                  key={rewardType.value}
                >
                  <input
                    defaultChecked={settings?.rewardTypes.includes(rewardType.value)}
                    name="rewardTypes"
                    type="checkbox"
                    value={rewardType.value}
                  />
                  {rewardType.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                Reward tiers
              </legend>
              {tiers.map((tier, index) => (
                <div className="grid grid-cols-[1fr_1fr_5rem] gap-2" key={index}>
                  <input
                    className={adminInputClass}
                    defaultValue={tier.key}
                    name="tierKey"
                    placeholder="key"
                  />
                  <input
                    className={adminInputClass}
                    defaultValue={tier.label}
                    name="tierLabel"
                    placeholder="Label"
                  />
                  <input
                    className={adminInputClass}
                    defaultValue={tier.threshold}
                    min={0}
                    name="tierThreshold"
                    type="number"
                  />
                </div>
              ))}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                Participant reward messaging
              </legend>
              <p className="text-sm leading-6 text-slate-600">
                Leave these blank to use automatic defaults based on the reward
                types above.
              </p>
              <div className="rounded-lg bg-white/70 px-3 py-3 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Current top bar preview
                </p>
                <p className="mt-2">{participantBannerPreview}</p>
              </div>
              <AdminField label="Full banner message override">
                <input
                  className={adminInputClass}
                  defaultValue={participantMessaging?.saveProgressMessage ?? ""}
                  name="saveProgressMessage"
                  placeholder="Add your email so you can save your progress and hear about prizes later."
                />
              </AdminField>
              <AdminField label="Prize draw label override">
                <input
                  className={adminInputClass}
                  defaultValue={participantMessaging?.prizeDrawLabel ?? ""}
                  name="prizeDrawLabel"
                  placeholder="weekend prize draw"
                />
              </AdminField>
              <AdminField label="Later prize label override">
                <input
                  className={adminInputClass}
                  defaultValue={participantMessaging?.laterPrizeLabel ?? ""}
                  name="laterPrizeLabel"
                  placeholder="festival prizes"
                />
              </AdminField>
            </fieldset>

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
            <Button type="submit">Save settings</Button>
          </Form>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
