import { StatusBadge } from "@qianlu-events/ui";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/admin-event-leads";
import { fetchAdminEvent, fetchAdminLeads } from "../lib/api.server";
import { AdminCard, AdminShell } from "../components/admin-shell";

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const [event, leadsReport] = await Promise.all([
      fetchAdminEvent(params.eventSlug, request),
      fetchAdminLeads(params.eventSlug, request),
    ]);

    return {
      event,
      ...leadsReport,
    };
  } catch {
    return redirect("/admin");
  }
}

export default function AdminEventLeads({ loaderData }: Route.ComponentProps) {
  const { event, leads } = loaderData;

  return (
    <AdminShell
      description="Review submitted lead tasks and export the useful contact data."
      eventSlug={event.slug}
      title={`${event.name} leads`}
    >
      <div className="space-y-4">
        <AdminCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Lead submissions
              </p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {leads.length}
              </p>
            </div>
            <Link
              className="action-link action-link-primary rounded-lg"
              to={`/admin/events/${event.slug}/export`}
            >
              Download leads CSV
            </Link>
          </div>
        </AdminCard>

        {leads.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white/75">
            <table className="min-w-full divide-y divide-[var(--color-border)] text-left text-sm">
              <thead className="bg-white/80 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Opt-in</th>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-4 py-3 font-display font-semibold tracking-[0.12em]">
                      {lead.verificationCode}
                    </td>
                    <td className="px-4 py-3">{lead.name ?? "Unnamed"}</td>
                    <td className="px-4 py-3">{lead.email ?? "No email"}</td>
                    <td className="px-4 py-3">
                      {lead.optIn === null ? "Unknown" : lead.optIn ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">{lead.submittedTask}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={lead.status} tone="neutral" />
                    </td>
                    <td className="px-4 py-3">{formatDate(lead.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <AdminCard>
            <p className="text-sm text-slate-700">
              No lead submissions yet. Lead form, newsletter, and WhatsApp opt-in
              tasks will appear here after participants submit them.
            </p>
          </AdminCard>
        )}
      </div>
    </AdminShell>
  );
}

