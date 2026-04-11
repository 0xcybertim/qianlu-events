import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/admin-events";
import { createAdminEvent, fetchAdminEvents } from "../lib/api.server";
import {
  AdminCard,
  AdminField,
  AdminShell,
  adminInputClass,
} from "../components/admin-shell";

const defaultBranding = {
  primary: "#0f6d53",
  primaryContrast: "#f5f8f1",
  secondary: "#f2c66f",
  surface: "#f6efe5",
  surfaceStrong: "#fffaf3",
  text: "#162216",
  border: "#d6dccd",
};

export async function loader({ request }: Route.LoaderArgs) {
  try {
    return fetchAdminEvents(request);
  } catch {
    return redirect("/admin");
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = formData.get("name")?.toString() ?? "";
  const slug = formData.get("slug")?.toString() ?? "";

  try {
    const event = await createAdminEvent(
      {
        name,
        slug,
        status: "DRAFT",
        brandingJson: defaultBranding,
        settingsJson: {
          rewardTypes: ["INSTANT_REWARD", "TIERED_REWARD", "DAILY_PRIZE_DRAW"],
          rewardTiers: [],
        },
      },
      request,
    );

    return redirect(`/admin/events/${event.slug}`);
  } catch {
    return {
      error:
        "Could not create event. Use a unique lowercase slug like spring-market-2026.",
    };
  }
}

export default function AdminEvents({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  return (
    <AdminShell
      title="Events"
      description="Create internal event configs and open an event to manage setup and reporting."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {loaderData.events.length > 0 ? (
            loaderData.events.map((event) => (
              <AdminCard key={event.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-2xl font-semibold">
                        {event.name}
                      </h2>
                      <StatusBadge label={event.status} tone="neutral" />
                      <StatusBadge label={event.adminRole} tone="verified" />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">/{event.slug}</p>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Tasks
                        </dt>
                        <dd className="mt-1 font-display text-xl font-semibold">
                          {event.taskCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Participants
                        </dt>
                        <dd className="mt-1 font-display text-xl font-semibold">
                          {event.participantCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Leads
                        </dt>
                        <dd className="mt-1 font-display text-xl font-semibold">
                          {event.leadCount}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <Link
                    className="action-link action-link-primary rounded-lg"
                    to={`/admin/events/${event.slug}`}
                  >
                    Open event
                  </Link>
                </div>
              </AdminCard>
            ))
          ) : (
            <AdminCard>
              <p className="text-sm text-slate-700">
                No events yet. Create the first organizer event config.
              </p>
            </AdminCard>
          )}
        </div>

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">Create event</h2>
          <Form className="mt-4 space-y-4" method="post">
            <AdminField label="Event name">
              <input className={adminInputClass} name="name" required />
            </AdminField>
            <AdminField label="Slug">
              <input
                className={adminInputClass}
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="spring-market-2026"
                required
              />
            </AdminField>
            {actionData?.error ? (
              <p className="text-sm font-medium text-rose-700">
                {actionData.error}
              </p>
            ) : null}
            <Button type="submit">Create draft</Button>
          </Form>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
