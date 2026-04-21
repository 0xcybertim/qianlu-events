import { useState } from "react";
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

function formatAnswerValue(
  value: string | boolean | string[] | null,
  otherValue: string | null,
) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "boolean"
      ? [value ? "Yes" : "No"]
      : value
        ? [value]
        : [];
  const visibleValues = values.map((entry) =>
    entry === "Other" && otherValue ? `Other: ${otherValue}` : entry,
  );

  if (otherValue && !visibleValues.some((entry) => entry.startsWith("Other:"))) {
    visibleValues.push(otherValue);
  }

  return visibleValues.length > 0 ? visibleValues.join(", ") : "No answer";
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
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead =
    leads.find((lead) => lead.id === selectedLeadId) ?? null;

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
                  <th className="px-4 py-3">Results</th>
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
                    <td className="px-4 py-3">
                      <button
                        className="font-semibold text-[var(--color-primary)]"
                        onClick={() => setSelectedLeadId(lead.id)}
                        type="button"
                      >
                        View answers
                      </button>
                    </td>
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
      {selectedLead ? (
        <div
          aria-labelledby="lead-results-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/20"
          role="dialog"
        >
          <button
            aria-label="Close lead results"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedLeadId(null)}
            type="button"
          />
          <aside className="relative flex h-full w-full max-w-[34rem] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-strong)] shadow-[-24px_0_70px_-42px_rgba(15,23,42,0.55)]">
            <header className="border-b border-[var(--color-border)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Lead results
                  </p>
                  <h2
                    className="mt-2 font-display text-2xl font-semibold text-[var(--color-text)]"
                    id="lead-results-title"
                  >
                    {selectedLead.name ?? "Unnamed lead"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedLead.email ?? "No email"} ·{" "}
                    {selectedLead.verificationCode}
                  </p>
                </div>
                <button
                  aria-label="Close lead results"
                  className="rounded-lg border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => setSelectedLeadId(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="rounded-lg border border-[var(--color-border)] bg-white/75 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Selected interests
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-900">
                    {selectedLead.selectedInterests.length > 0
                      ? selectedLead.selectedInterests.join(", ")
                      : "None selected"}
                  </p>
                </div>
                {selectedLead.answers.length > 0 ? (
                  <div className="space-y-4">
                    {selectedLead.answers.map((answer) => (
                      <div
                        className="rounded-lg border border-[var(--color-border)] bg-white/75 p-4"
                        key={`${selectedLead.id}-${answer.id}`}
                      >
                        {answer.groupTitle ? (
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                            {answer.groupTitle}
                          </p>
                        ) : null}
                        <p className="mt-1 font-semibold text-slate-950">
                          {answer.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {formatAnswerValue(answer.value, answer.otherValue)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-[var(--color-border)] bg-white/75 p-4 text-sm text-slate-600">
                    No questionnaire answers were saved for this submission.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </AdminShell>
  );
}
