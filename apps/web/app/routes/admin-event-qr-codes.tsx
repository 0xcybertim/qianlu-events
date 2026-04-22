import { StatusBadge } from "@qianlu-events/ui";
import { Button } from "@qianlu-events/ui";
import { Form, redirect } from "react-router";
import QRCode from "qrcode";

import type { Route } from "./+types/admin-event-qr-codes";
import {
  createAdminQrCode,
  fetchAdminEvent,
  fetchAdminQrCodes,
} from "../lib/api.server";
import { buildPageTitle } from "../lib/meta";
import {
  AdminCard,
  AdminField,
  AdminShell,
  adminInputClass,
} from "../components/admin-shell";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: buildPageTitle("QR Codes", params.eventSlug) }];
}

function formatDate(value: string | null) {
  if (!value) {
    return "No limit";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const [event, qrCodeReport] = await Promise.all([
      fetchAdminEvent(params.eventSlug, request),
      fetchAdminQrCodes(params.eventSlug, request),
    ]);
    const origin = new URL(request.url).origin;
    const qrCodes = await Promise.all(
      qrCodeReport.qrCodes.map(async (qrCode) => {
        const scanHref = qrCode.scanUrl
          ? new URL(qrCode.scanUrl, origin).toString()
          : null;
        const svg = scanHref
          ? await QRCode.toString(scanHref, {
              errorCorrectionLevel: "M",
              margin: 2,
              type: "svg",
              width: 224,
            })
          : null;

        return {
          ...qrCode,
          qrImageSrc: svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null,
          scanHref,
        };
      }),
    );

    return {
      event,
      qrCodes,
    };
  } catch {
    return redirect("/admin");
  }
}

function parseDateTimeLocal(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();

  try {
    await createAdminQrCode(
      params.eventSlug,
      {
        taskId: formData.get("taskId")?.toString() ?? "",
        label: formData.get("label")?.toString() || undefined,
        validFrom: parseDateTimeLocal(
          formData.get("validFrom")?.toString() ?? "",
        ),
        validUntil: parseDateTimeLocal(
          formData.get("validUntil")?.toString() ?? "",
        ),
        scanLimitPerSession: Number(
          formData.get("scanLimitPerSession")?.toString() ?? 1,
        ),
        cooldownSeconds:
          formData.get("cooldownSeconds")?.toString()
            ? Number(formData.get("cooldownSeconds")?.toString())
            : null,
        isActive: formData.get("isActive") === "on",
      },
      request,
    );

    return {
      success: "QR code generated.",
    };
  } catch {
    return {
      error: "Could not generate QR code. Choose a stamp scan task.",
    };
  }
}

export default function AdminEventQrCodes({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const { event, qrCodes } = loaderData;
  const stampTasks = event.tasks.filter((task) => task.type === "STAMP_SCAN");
  const runningCount = qrCodes.filter((qrCode) => qrCode.isRunning).length;
  const activeCount = qrCodes.filter((qrCode) => qrCode.isActive).length;
  const acceptedCount = qrCodes.reduce(
    (sum, qrCode) => sum + qrCode.scanCounts.accepted,
    0,
  );

  return (
    <AdminShell
      description="Review the stamp QR codes configured for this event and see which ones are active right now."
      eventSlug={event.slug}
      title={`${event.name} QR codes`}
    >
      <div className="space-y-5">
        <AdminCard>
          <h2 className="font-display text-xl font-semibold">
            Generate QR code
          </h2>
          <Form className="mt-4 grid gap-4 lg:grid-cols-2" method="post">
            <AdminField label="Stamp task">
              <select className={adminInputClass} name="taskId" required>
                {stampTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Label">
              <input
                className={adminInputClass}
                name="label"
                placeholder="Defaults to task title"
              />
            </AdminField>
            <AdminField label="Valid from">
              <input
                className={adminInputClass}
                name="validFrom"
                type="datetime-local"
              />
            </AdminField>
            <AdminField label="Valid until">
              <input
                className={adminInputClass}
                name="validUntil"
                type="datetime-local"
              />
            </AdminField>
            <AdminField label="Limit per participant">
              <input
                className={adminInputClass}
                defaultValue={1}
                min={1}
                name="scanLimitPerSession"
                type="number"
              />
            </AdminField>
            <AdminField label="Cooldown seconds">
              <input
                className={adminInputClass}
                min={1}
                name="cooldownSeconds"
                placeholder="Optional"
                type="number"
              />
            </AdminField>
            <label className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
              <input defaultChecked name="isActive" type="checkbox" />
              Active immediately
            </label>
            <div className="flex items-center">
              <Button disabled={stampTasks.length === 0} type="submit">
                Generate QR code
              </Button>
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
          </Form>
          {stampTasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-700">
              Create a STAMP_SCAN task before generating QR codes.
            </p>
          ) : null}
        </AdminCard>

        <div className="grid gap-4 sm:grid-cols-3">
          <AdminCard>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Running now
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {runningCount}
            </p>
          </AdminCard>
          <AdminCard>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Active records
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {activeCount}
            </p>
          </AdminCard>
          <AdminCard>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Accepted scans
            </p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {acceptedCount}
            </p>
          </AdminCard>
        </div>

        {qrCodes.length > 0 ? (
          <div className="grid gap-4">
            {qrCodes.map((qrCode) => (
              <AdminCard key={qrCode.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex size-48 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white p-3">
                      {qrCode.qrImageSrc ? (
                        <img
                          alt={`QR code for ${qrCode.label}`}
                          className="size-full"
                          src={qrCode.qrImageSrc}
                        />
                      ) : (
                        <p className="px-3 text-center text-xs leading-5 text-slate-500">
                          No public token stored for this QR code.
                        </p>
                      )}
                    </div>
                    <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-semibold">
                        {qrCode.label}
                      </h2>
                      <StatusBadge
                        label={qrCode.isRunning ? "RUNNING" : "NOT RUNNING"}
                        tone={qrCode.isRunning ? "verified" : "neutral"}
                      />
                      <StatusBadge
                        label={qrCode.isActive ? "ACTIVE" : "INACTIVE"}
                        tone={qrCode.isActive ? "neutral" : "warning"}
                      />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {qrCode.taskTitle} - {qrCode.taskType}
                    </p>
                    <p className="mt-2 break-all text-xs text-slate-500">
                      QR code id: {qrCode.id}
                    </p>
                    {qrCode.scanHref ? (
                      <a
                        className="mt-3 inline-flex break-all rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--color-primary)]"
                        href={qrCode.scanHref}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {qrCode.scanHref}
                      </a>
                    ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-72">
                    <div className="rounded-lg bg-white/70 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Accepted
                      </p>
                      <p className="mt-1 font-display text-2xl font-semibold">
                        {qrCode.scanCounts.accepted}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/70 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Total scans
                      </p>
                      <p className="mt-1 font-display text-2xl font-semibold">
                        {qrCode.scanCounts.total}
                      </p>
                    </div>
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-white/70 p-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Valid from
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {formatDate(qrCode.validFrom)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Valid until
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {formatDate(qrCode.validUntil)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Limit per session
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {qrCode.scanLimitPerSession}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Cooldown
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      {qrCode.cooldownSeconds
                        ? `${qrCode.cooldownSeconds}s`
                        : "None"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
                  <span className="rounded-lg bg-white/70 px-3 py-2">
                    Duplicate: {qrCode.scanCounts.duplicate}
                  </span>
                  <span className="rounded-lg bg-white/70 px-3 py-2">
                    Expired: {qrCode.scanCounts.expired}
                  </span>
                  <span className="rounded-lg bg-white/70 px-3 py-2">
                    Inactive: {qrCode.scanCounts.inactive}
                  </span>
                  <span className="rounded-lg bg-white/70 px-3 py-2">
                    Wrong event: {qrCode.scanCounts.wrongEvent}
                  </span>
                </div>
              </AdminCard>
            ))}
          </div>
        ) : (
          <AdminCard>
            <p className="text-sm text-slate-700">
              No QR codes are configured for this event yet.
            </p>
          </AdminCard>
        )}
      </div>
    </AdminShell>
  );
}
