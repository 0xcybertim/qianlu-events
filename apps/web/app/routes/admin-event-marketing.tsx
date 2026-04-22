import { Button } from "@qianlu-events/ui";
import { Form, redirect } from "react-router";

import type { Route } from "./+types/admin-event-marketing";
import { fetchAdminEvent, updateAdminEvent } from "../lib/api.server";
import {
  AdminCard,
  AdminField,
  AdminShell,
  adminInputClass,
} from "../components/admin-shell";

function maskPixelId(pixelId: string) {
  if (pixelId.length <= 4) {
    return pixelId;
  }

  return `${pixelId.slice(0, 4)}...${pixelId.slice(-4)}`;
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
  const currentEvent = await fetchAdminEvent(params.eventSlug, request);
  const primaryPixelId =
    formData.get("primaryPixelId")?.toString().trim() ?? "";
  const secondaryPixelId =
    formData.get("secondaryPixelId")?.toString().trim() ?? "";

  try {
    await updateAdminEvent(
      params.eventSlug,
      {
        settingsJson: {
          rewardTypes: currentEvent.settingsJson?.rewardTypes ?? [],
          rewardTiers: currentEvent.settingsJson?.rewardTiers ?? [],
          instantRewards: currentEvent.settingsJson?.instantRewards ?? [],
          participantMessaging: currentEvent.settingsJson?.participantMessaging,
          marketing: {
            ...(primaryPixelId ? { primaryPixelId } : {}),
            ...(secondaryPixelId ? { secondaryPixelId } : {}),
          },
        },
      },
      request,
    );

    return {
      success: "Marketing settings saved.",
    };
  } catch {
    return {
      error: "Could not save marketing settings.",
    };
  }
}

export default function AdminEventMarketing({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const marketing = loaderData.settingsJson?.marketing;
  const primaryPixelId = marketing?.primaryPixelId ?? "";
  const secondaryPixelId = marketing?.secondaryPixelId ?? "";
  const activePixelIds = [primaryPixelId, secondaryPixelId].filter(Boolean);

  return (
    <AdminShell
      description="Configure up to two Meta Pixels for this event. Tracking only runs on participant event pages and only after the visitor accepts marketing cookies."
      eventSlug={loaderData.slug}
      title={loaderData.name}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <AdminCard>
          <h2 className="font-display text-xl font-semibold">Marketing</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Add one or two Meta Pixel IDs for this event. Leave a field blank if
            you only want one pixel or want to disable tracking entirely.
          </p>

          <Form className="mt-5 space-y-4" method="post">
            <AdminField label="Pixel 1 ID">
              <input
                className={adminInputClass}
                defaultValue={primaryPixelId}
                inputMode="numeric"
                name="primaryPixelId"
                placeholder="984487580910625"
              />
            </AdminField>

            <AdminField label="Pixel 2 ID">
              <input
                className={adminInputClass}
                defaultValue={secondaryPixelId}
                inputMode="numeric"
                name="secondaryPixelId"
                placeholder="1715904086434480"
              />
            </AdminField>

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

            <Button type="submit">Save marketing</Button>
          </Form>
        </AdminCard>

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">Event behavior</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Participant event pages send the same marketing events to every
            configured pixel after cookie consent is accepted.
          </p>
          <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active pixels
            </p>
            {activePixelIds.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {activePixelIds.map((pixelId, index) => (
                  <li key={pixelId}>
                    Pixel {index + 1}: <span className="font-medium text-slate-900">{maskPixelId(pixelId)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">No pixels configured for this event.</p>
            )}
          </div>
          <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Consent
            </p>
            <p className="mt-2 leading-6">
              If the visitor clicks reject, no Meta script loads and no events
              are sent to any configured pixel.
            </p>
          </div>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
