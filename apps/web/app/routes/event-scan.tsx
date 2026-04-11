import { data, Link } from "react-router";
import { qrScanResultSchema } from "@qianlu-events/schemas";
import type { CSSProperties } from "react";

import type { Route } from "./+types/event-scan";
import { fetchExperience, postApi } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
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

const checkmarkColors = [
  "#0f9f6e",
  "#22c55e",
  "#16a34a",
  "#34d399",
  "#047857",
  "#bbf7d0",
];

const confettiPieces = Array.from({ length: 100 }, (_, index) => {
  const column = index % 20;
  const row = Math.floor(index / 20);
  const direction = column - 9.5;
  const x = direction * 18 + (row % 2 === 0 ? 8 : -8);
  const y = -128 - row * 22 - (column % 5) * 9;
  const rotation = (index * 47) % 360;
  const delay = (index % 12) * 0.018;
  const duration = 1.1 + (index % 7) * 0.055;

  return {
    color: checkmarkColors[index % checkmarkColors.length],
    delay,
    duration,
    rotation,
    size: 9 + (index % 5) * 4,
    x,
    y,
  };
});

function SuccessBurst() {
  return (
    <div aria-hidden="true" className="scan-success-burst">
      <div className="scan-success-mark">
        <svg
          className="size-16"
          fill="none"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 33.5 27.2 43 47 21"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="7"
          />
        </svg>
      </div>
      <div className="scan-confetti-stage">
        {confettiPieces.map((piece, index) => (
          <span
            className="scan-confetti-piece"
            key={index}
            style={
              {
                "--confetti-color": piece.color,
                "--confetti-delay": `${piece.delay}s`,
                "--confetti-duration": `${piece.duration}s`,
                "--confetti-rotate": `${piece.rotation}deg`,
                "--confetti-size": `${piece.size}px`,
                "--confetti-x": `${piece.x}px`,
                "--confetti-y": `${piece.y}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
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
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5">
          {isAccepted ? <SuccessBurst /> : null}
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
          <Link className="action-link action-link-primary" to={`/${params.eventSlug}/tasks`}>
            Back to tasks
          </Link>
          <Link className="action-link action-link-secondary" to={`/${params.eventSlug}/summary`}>
            Show summary
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
