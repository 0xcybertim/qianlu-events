import { data, Link } from "react-router";
import { qrScanResultSchema } from "@qianlu-events/schemas";

import type { Route } from "./+types/event-scan";
import { fetchExperience, postApi } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { CheckmarkBurst } from "../components/checkmark-burst";
import { ScreenShell } from "../components/screen-shell";

function requestWithSetCookie(request: Request, setCookie: string | null) {
  if (!setCookie) {
    return request;
  }

  const cookiePair = setCookie.split(";")[0];

  if (!cookiePair) {
    return request;
  }

  const headers = new Headers(request.headers);
  const existingCookie = headers.get("Cookie");

  headers.set(
    "Cookie",
    existingCookie ? `${existingCookie}; ${cookiePair}` : cookiePair,
  );

  return new Request(request, { headers });
}

function getResultCopy(status: string) {
  switch (status) {
    case "ACCEPTED":
      return {
        eyebrow: "Stamp accepted",
        title: "Stamp added",
        description: "Your progress has been updated.",
      };
    case "DUPLICATE":
      return {
        eyebrow: "Already scanned",
        title: "Already stamped",
        description: "This QR code was already used for your session.",
      };
    case "EXPIRED":
      return {
        eyebrow: "Stamp expired",
        title: "This stamp has expired",
        description: "Ask the team for the current QR code.",
      };
    case "WRONG_EVENT":
      return {
        eyebrow: "Wrong event",
        title: "This stamp is for another event",
        description: "Scan a QR code from this event to collect points here.",
      };
    default:
      return {
        eyebrow: "Stamp inactive",
        title: "This stamp is not active",
        description: "Ask the team to check the QR code.",
      };
  }
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const experienceResponse = await fetchExperience(params.eventSlug, request);
  const responseHeaders = new Headers(experienceResponse.init?.headers);
  const scanRequest = requestWithSetCookie(
    request,
    responseHeaders.get("Set-Cookie"),
  );
  const scanResponse = await postApi(
    `/events/${encodeURIComponent(params.eventSlug)}/qr-scans`,
    {
      token: params.token,
    },
    scanRequest,
  );
  const result = qrScanResultSchema.parse(await scanResponse.json());

  return data(
    {
      experience: experienceResponse.data,
      result,
    },
    {
      headers: responseHeaders,
    },
  );
}

export default function EventScan({ loaderData, params }: Route.ComponentProps) {
  const copy = getResultCopy(loaderData.result.status);
  const themeStyle = getBrandingStyle(loaderData.experience);
  const isAccepted = loaderData.result.status === "ACCEPTED";

  return (
    <ScreenShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      marketing={{
        analytics: {
          claimed_points_total: loaderData.result.session.claimedPoints,
          points_awarded: loaderData.result.pointsAwarded,
          qr_status: loaderData.result.status,
          verified_points_total: loaderData.result.session.verifiedPoints,
        },
        eventName: loaderData.experience.event.name,
        eventSlug: loaderData.experience.event.slug,
        page: "scan-result",
        pointsAwarded: loaderData.result.pointsAwarded,
        qrStatus: loaderData.result.status,
        qrToken: params.token,
        sessionKey: loaderData.result.session.verificationCode,
        settings: loaderData.experience.event.settingsJson,
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5">
          {isAccepted ? <CheckmarkBurst /> : null}
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {loaderData.result.status.replace("_", " ")}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {loaderData.result.message}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Added
              </p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {loaderData.result.pointsAwarded}
              </p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Total
              </p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {loaderData.result.session.claimedPoints}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            className="action-link action-link-primary"
            data-analytics-cta-name="back_to_tasks"
            data-analytics-event="scan_result_navigation_click"
            data-analytics-location="footer"
            data-analytics-scan-status={loaderData.result.status}
            to={`/${params.eventSlug}/tasks`}
          >
            Back to activities
          </Link>
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="show_summary"
            data-analytics-event="scan_result_navigation_click"
            data-analytics-location="footer"
            data-analytics-scan-status={loaderData.result.status}
            to={`/${params.eventSlug}/summary`}
          >
            Show summary
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
