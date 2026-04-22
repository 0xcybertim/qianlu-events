import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@qianlu-events/ui";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

import type { Route } from "./+types/event-scan-camera";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { buildPageTitle } from "../lib/meta";
import { trackParticipantAnalyticsEvent } from "../lib/marketing";
import { ScreenShell } from "../components/screen-shell";

type ScannerState = "idle" | "starting" | "scanning" | "found" | "error";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: buildPageTitle("Scan Camera", params.eventSlug) }];
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getScanNavigationTarget(scannedText: string, eventSlug: string) {
  const text = scannedText.trim();

  if (!text) {
    return null;
  }

  try {
    const parsedUrl = new URL(text, window.location.origin);
    const [scannedEventSlug, routeName, token] = parsedUrl.pathname
      .split("/")
      .filter(Boolean);

    if (scannedEventSlug && routeName === "scan" && token) {
      return `/${encodeURIComponent(
        decodeURIComponent(scannedEventSlug),
      )}/scan/${encodeURIComponent(decodeURIComponent(token))}`;
    }
  } catch {
    // Plain tokens are handled below.
  }

  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) {
    return `/${encodeURIComponent(eventSlug)}/scan/${encodeURIComponent(text)}`;
  }

  return null;
}

function getCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission was blocked. Allow camera access in your browser settings and try again.";
    }

    if (error.name === "NotFoundError") {
      return "No camera was found on this device.";
    }

    if (error.name === "NotReadableError") {
      return "The camera is already in use by another app.";
    }
  }

  return "The camera could not start on this device.";
}

function getErrorName(error: unknown) {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name;
  }

  return typeof error;
}

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException || error instanceof Error) {
    return error.message || "No browser error message was provided.";
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "The browser did not provide readable error details.";
  }
}

async function getCameraPermissionState() {
  if (!navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });

    return status.state;
  } catch {
    return "unknown";
  }
}

async function buildCameraErrorDetail(error: unknown) {
  const permissionState = await getCameraPermissionState();
  const mediaDevicesAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
  const protocol = window.location.protocol;
  const secureContext = window.isSecureContext ? "yes" : "no";

  return [
    `Browser error: ${getErrorName(error)} - ${getErrorMessage(error)}`,
    `Camera permission: ${permissionState}`,
    `Secure context: ${secureContext}`,
    `Protocol: ${protocol}`,
    `getUserMedia available: ${mediaDevicesAvailable ? "yes" : "no"}`,
  ].join("\n");
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export default function EventScanCamera({
  loaderData,
  params,
}: Route.ComponentProps) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const didNavigateRef = useRef(false);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [message, setMessage] = useState(
    "Start the camera and point it at a stamp QR code.",
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const themeStyle = getBrandingStyle(loaderData);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  async function startScanner() {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.isSecureContext && !isLocalHost(window.location.hostname)) {
      trackParticipantAnalyticsEvent({
        googleEventName: "scan_camera_start_failed",
        params: {
          error_name: "InsecureContext",
          reason: "insecure_context",
        },
      });
      setScannerState("error");
      setMessage(
        "Camera scanning needs HTTPS. Open the deployed event URL to scan from your phone.",
      );
      setErrorDetail(
        [
          "Browser error: InsecureContext - Camera access is blocked outside HTTPS.",
          "Camera permission: unknown",
          "Secure context: no",
          `Protocol: ${window.location.protocol}`,
          `getUserMedia available: ${navigator.mediaDevices ? "yes" : "no"}`,
        ].join("\n"),
      );

      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      trackParticipantAnalyticsEvent({
        googleEventName: "scan_camera_start_failed",
        params: {
          error_name: "NotSupported",
          reason: "get_user_media_missing",
        },
      });
      setScannerState("error");
      setMessage("This browser does not support camera scanning.");
      setErrorDetail(
        [
          "Browser error: NotSupported - navigator.mediaDevices.getUserMedia is missing.",
          "Camera permission: unknown",
          `Secure context: ${window.isSecureContext ? "yes" : "no"}`,
          `Protocol: ${window.location.protocol}`,
          "getUserMedia available: no",
        ].join("\n"),
      );

      return;
    }

    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    controlsRef.current?.stop();
    didNavigateRef.current = false;
    setScannerState("starting");
    setMessage("Starting camera...");
    setErrorDetail(null);
    trackParticipantAnalyticsEvent({
      googleEventName: "scan_camera_start_requested",
      params: {
        scanner_state: "starting",
      },
    });

    try {
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 800,
        tryPlayVideoTimeout: 5000,
      });

      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.setAttribute("playsinline", "true");

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { ideal: 720 },
            width: { ideal: 1280 },
          },
        },
        videoElement,
        (result, _error, activeControls) => {
          if (!result || didNavigateRef.current) {
            return;
          }

          const target = getScanNavigationTarget(result.getText(), params.eventSlug);

          if (!target) {
            activeControls.stop();
            controlsRef.current = null;
            trackParticipantAnalyticsEvent({
              googleEventName: "scan_camera_invalid_qr",
              params: {
                scanner_state: "error",
              },
            });
            setScannerState("error");
            setMessage("That QR code is not a stamp QR code for this app.");
            setErrorDetail(`Scanned value: ${result.getText()}`);
            return;
          }

          didNavigateRef.current = true;
          setScannerState("found");
          setMessage("Stamp found. Checking it now...");
          trackParticipantAnalyticsEvent({
            googleEventName: "scan_camera_qr_detected",
            params: {
              scanner_state: "found",
            },
          });
          activeControls.stop();
          controlsRef.current = null;
          void navigate(target);
        },
      );

      controlsRef.current = controls;
      setScannerState("scanning");
      setMessage("Point the camera at a stamp QR code.");
      trackParticipantAnalyticsEvent({
        googleEventName: "scan_camera_started",
        params: {
          scanner_state: "scanning",
        },
      });
    } catch (error) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setScannerState("error");
      setMessage(getCameraErrorMessage(error));
      setErrorDetail(await buildCameraErrorDetail(error));
      trackParticipantAnalyticsEvent({
        googleEventName: "scan_camera_start_failed",
        params: {
          error_name: getErrorName(error),
          reason: "browser_error",
        },
      });
    }
  }

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScannerState("idle");
    setMessage("Camera stopped. Start it again when you are ready.");
    setErrorDetail(null);
    trackParticipantAnalyticsEvent({
      googleEventName: "scan_camera_stopped",
      params: {
        scanner_state: "idle",
      },
    });
  }

  const isCameraActive =
    scannerState === "starting" || scannerState === "scanning";

  return (
    <ScreenShell
      eyebrow="Scan stamp"
      title="Scan a stamp QR code"
      description="Use this camera scanner when you find a stamp point at the event."
      marketing={{
        analytics: {
          has_session: Boolean(loaderData.session),
        },
        eventName: loaderData.event.name,
        eventSlug: loaderData.event.slug,
        page: "scan-camera",
        sessionKey: loaderData.session?.verificationCode ?? null,
        settings: loaderData.event.settingsJson,
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-4">
          <div className="relative overflow-hidden rounded-2xl bg-slate-950">
            <video
              aria-label="QR scanner camera preview"
              autoPlay
              className="aspect-[3/4] w-full object-cover"
              muted
              playsInline
              ref={videoRef}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-56 max-w-[72%] rounded-[1.5rem] border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.42)]" />
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
              {scannerState}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{message}</p>
            {errorDetail ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-100">
                {errorDetail}
              </pre>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {isCameraActive ? (
              <Button
                data-analytics-event="scan_camera_stop_click"
                data-analytics-location="scanner_controls"
                tone="secondary"
                onClick={stopScanner}
              >
                Stop camera
              </Button>
            ) : (
              <Button
                data-analytics-event="scan_camera_start_click"
                data-analytics-location="scanner_controls"
                disabled={scannerState === "found"}
                onClick={startScanner}
              >
                Start camera
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="back_to_tasks"
            data-analytics-event="scan_camera_navigation_click"
            data-analytics-location="footer"
            to={`/${params.eventSlug}/tasks`}
          >
            Back to activities
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
