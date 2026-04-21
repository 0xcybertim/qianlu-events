import { useSignIn, useSignUp, useUser } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { type FormEvent, useEffect, useState } from "react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/event-account";
import {
  fetchExperience,
  linkParticipantClerkAccount,
} from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getParticipantContactReasonText } from "../lib/experience";
import { trackParticipantAnalyticsEvent } from "../lib/marketing";
import { ScreenShell } from "../components/screen-shell";

const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  "";
const clerkSecretKey = import.meta.env.SSR
  ? (process.env.CLERK_SECRET_KEY ?? "")
  : "";
const clerkEnabled =
  Boolean(clerkPublishableKey) &&
  (import.meta.env.SSR ? Boolean(clerkSecretKey) : true);

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export async function action(args: Route.ActionArgs) {
  if (!clerkEnabled) {
    return {
      error: "Email sign-in is not configured yet.",
    };
  }

  const auth = await getAuth(args);

  if (!auth.isAuthenticated) {
    return {
      error: "Sign in with your email first.",
    };
  }

  const token = await auth.getToken();

  if (!token) {
    return {
      error: "Could not verify your Clerk session.",
    };
  }

  try {
    const result = await linkParticipantClerkAccount(
      args.params.eventSlug,
      token,
      args.request,
    );

    return redirect(`/${result.payload.eventSlug}/tasks`, {
      headers: result.headers,
    });
  } catch {
    return {
      error: "Could not attach this email to your event progress.",
    };
  }
}

function ClerkAccountContent({
  actionData,
  loaderData,
  params,
}: Route.ComponentProps) {
  const session = loaderData.session;
  const themeStyle = getBrandingStyle(loaderData);
  const contactReason = getParticipantContactReasonText(
    loaderData.event.settingsJson,
  );
  const isConnected = Boolean(session?.participantAccountUuid);
  const { isLoaded, isSignedIn, user } = useUser();
  const {
    signIn,
    fetchStatus: signInFetchStatus,
  } = useSignIn();
  const {
    signUp,
    fetchStatus: signUpFetchStatus,
  } = useSignUp();
  const clerkEmail =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  const [emailAddress, setEmailAddress] = useState(
    session?.email ?? clerkEmail ?? "",
  );
  const [code, setCode] = useState("");
  const [authStep, setAuthStep] = useState<"email" | "code">("email");
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const clerkFlowLoaded = isLoaded && Boolean(signIn) && Boolean(signUp);
  const authBusy =
    signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";

  useEffect(() => {
    if (!emailAddress && (session?.email || clerkEmail)) {
      setEmailAddress(session?.email ?? clerkEmail ?? "");
    }
  }, [clerkEmail, emailAddress, session?.email]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    setAuthStep("email");
    setCode("");
    setAuthError(null);
    setStatusMessage(null);

    if (clerkEmail) {
      setEmailAddress(clerkEmail);
    }
  }, [clerkEmail, isSignedIn]);

  const inputClassName =
    "mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none ring-[var(--color-primary)] focus:ring-2";

  function getClerkErrorMessage(error: unknown, fallback: string) {
    if (
      error &&
      typeof error === "object" &&
      "errors" in error &&
      Array.isArray(error.errors)
    ) {
      const firstError = error.errors[0];

      if (firstError && typeof firstError === "object") {
        if (
          "longMessage" in firstError &&
          typeof firstError.longMessage === "string" &&
          firstError.longMessage.length > 0
        ) {
          return firstError.longMessage;
        }

        if (
          "message" in firstError &&
          typeof firstError.message === "string" &&
          firstError.message.length > 0
        ) {
          return firstError.message;
        }
      }
    }

    return fallback;
  }

  async function finalizeCurrentSignIn() {
    if (!signIn) {
      return;
    }

    await signIn.finalize({
      navigate: async () => {},
    });
  }

  async function finalizeCurrentSignUp() {
    if (!signUp) {
      return;
    }

    await signUp.finalize({
      navigate: async () => {},
    });
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signIn) {
      return;
    }

    const normalizedEmail = emailAddress.trim().toLowerCase();

    if (!normalizedEmail) {
      setAuthError("Enter an email address first.");
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_send_failed",
        params: {
          reason: "missing_email",
        },
      });
      return;
    }

    setEmailAddress(normalizedEmail);
    setAuthError(null);
    setStatusMessage(null);

    const { error: createError } = await signIn.create({
      identifier: normalizedEmail,
      signUpIfMissing: true,
    });

    if (createError) {
      setAuthError(
        getClerkErrorMessage(createError, "Could not start email sign-in."),
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_send_failed",
        params: {
          reason: "sign_in_create_failed",
        },
      });
      return;
    }

    const { error: sendError } = await signIn.emailCode.sendCode();

    if (sendError) {
      setAuthError(
        getClerkErrorMessage(sendError, "Could not send the email code."),
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_send_failed",
        params: {
          reason: "send_code_failed",
        },
      });
      return;
    }

    setAuthStep("code");
    setCode("");
    setStatusMessage(`We sent a one-time code to ${normalizedEmail}.`);
    trackParticipantAnalyticsEvent({
      googleEventName: "account_code_sent",
      params: {
        auth_step: "code",
      },
    });
  }

  async function handleTransferToSignUp() {
    if (!signUp) {
      return;
    }

    const { error } = await signUp.create({ transfer: true });

    if (error) {
      setAuthError(
        getClerkErrorMessage(error, "Could not create the email account."),
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_sign_up_transfer_failed",
        params: {
          reason: "transfer_failed",
        },
      });
      return;
    }

    if (signUp.status === "complete") {
      trackParticipantAnalyticsEvent({
        googleEventName: "account_sign_up_transferred",
        params: {
          auth_step: "complete",
        },
      });
      await finalizeCurrentSignUp();
      return;
    }

    if (signUp.status === "missing_requirements") {
      const missingFields = signUp.missingFields?.join(", ");

      setAuthError(
        missingFields
          ? `Clerk still requires extra sign-up fields: ${missingFields}. For this participant flow, keep email as the only required field.`
          : "Clerk still requires extra sign-up fields. For this participant flow, keep email as the only required field.",
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_sign_up_transfer_failed",
        params: {
          reason: "missing_requirements",
        },
      });
      return;
    }

    setAuthError("Could not finish the email account setup.");
    trackParticipantAnalyticsEvent({
      googleEventName: "account_sign_up_transfer_failed",
      params: {
        reason: "unknown",
      },
    });
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signIn) {
      return;
    }

    const normalizedCode = code.trim();

    if (!normalizedCode) {
      setAuthError("Enter the code from the email first.");
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_verify_failed",
        params: {
          reason: "missing_code",
        },
      });
      return;
    }

    setAuthError(null);
    setStatusMessage(null);

    const { error } = await signIn.emailCode.verifyCode({
      code: normalizedCode,
    });

    if (error) {
      const firstError =
        "errors" in error && Array.isArray(error.errors) ? error.errors[0] : null;

      if (
        firstError &&
        typeof firstError === "object" &&
        "code" in firstError &&
        firstError.code === "sign_up_if_missing_transfer"
      ) {
        await handleTransferToSignUp();
        return;
      }

      setAuthError(
        getClerkErrorMessage(error, "Could not verify the email code."),
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_verify_failed",
        params: {
          reason: "verify_code_failed",
        },
      });
      return;
    }

    if (signIn.status === "complete") {
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_verified",
        params: {
          auth_step: "complete",
        },
      });
      await finalizeCurrentSignIn();
      return;
    }

    if (signIn.status === "needs_second_factor") {
      setAuthError(
        "This Clerk setup still asks for a second factor. Disable extra factors for the participant email flow.",
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_verify_failed",
        params: {
          reason: "needs_second_factor",
        },
      });
      return;
    }

    if (signIn.status === "needs_client_trust") {
      setAuthError(
        "This Clerk setup still requires extra device verification. Relax that setting for the participant email flow.",
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_verify_failed",
        params: {
          reason: "needs_client_trust",
        },
      });
      return;
    }

    setAuthError("Could not finish email sign-in.");
    trackParticipantAnalyticsEvent({
      googleEventName: "account_code_verify_failed",
      params: {
        reason: "unknown",
      },
    });
  }

  async function handleResendCode() {
    if (!signIn) {
      return;
    }

    setAuthError(null);
    setStatusMessage(null);

    const { error } = await signIn.emailCode.sendCode();

    if (error) {
      setAuthError(
        getClerkErrorMessage(error, "Could not resend the email code."),
      );
      trackParticipantAnalyticsEvent({
        googleEventName: "account_code_resend_failed",
        params: {
          reason: "send_code_failed",
        },
      });
      return;
    }

    setStatusMessage(`We sent a new code to ${emailAddress}.`);
    trackParticipantAnalyticsEvent({
      googleEventName: "account_code_resent",
      params: {
        auth_step: "code",
      },
    });
  }

  return (
    <ScreenShell
      eyebrow="Participant account"
      title={isConnected ? "Email set" : "Set your email"}
      description={
        isConnected
          ? `Your progress is linked to ${session?.email ?? "your email"}. You can come back with the same email later.`
          : `Use your email to ${contactReason}.`
      }
      marketing={{
        analytics: {
          account_connected: isConnected,
          auth_step: authStep,
          clerk_signed_in: isSignedIn,
          has_session_email: Boolean(session?.email),
        },
        eventName: loaderData.event.name,
        eventSlug: loaderData.event.slug,
        page: "account",
        sessionKey: session?.verificationCode ?? null,
        settings: loaderData.event.settingsJson,
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
        {!clerkFlowLoaded ? (
          <div className="card-surface rounded-[2rem] p-5">
            <p className="text-sm leading-6 text-slate-700">
              Loading email sign-in...
            </p>
          </div>
        ) : null}

        {clerkFlowLoaded && !isSignedIn ? (
          <div className="card-surface rounded-[2rem] p-5">
            <h2 className="mt-3 font-display text-2xl font-semibold">
              {authStep === "code" ? "Enter your code" : "Get a one-time code"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {authStep === "code"
                ? `Enter the code we sent to ${emailAddress}.`
                : "Enter your email and we’ll send a one-time code. If this email is new, Clerk will create the account after verification."}
            </p>
            {statusMessage ? (
              <p className="mt-4 text-sm font-medium text-[var(--color-primary)]">
                {statusMessage}
              </p>
            ) : null}
            {authError ? (
              <p className="mt-4 text-sm font-medium text-rose-700">
                {authError}
              </p>
            ) : null}
            {authStep === "email" ? (
              <form className="mt-5 space-y-4" onSubmit={handleSendCode}>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Email
                  <input
                    autoComplete="email"
                    className={inputClassName}
                    inputMode="email"
                    name="email"
                    onChange={(event) => setEmailAddress(event.target.value)}
                    placeholder="you@example.com"
                    required
                    type="email"
                    value={emailAddress}
                  />
                </label>
                <div
                  className="min-h-0"
                  data-cl-language="auto"
                  data-cl-size="flexible"
                  data-cl-theme="auto"
                  id="clerk-captcha"
                />
                <button
                  className="action-link action-link-primary w-full"
                  data-analytics-event="account_send_code_click"
                  data-analytics-location="email_step"
                  disabled={authBusy}
                  type="submit"
                >
                  {authBusy ? "Sending..." : "Send code"}
                </button>
              </form>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={handleVerifyCode}>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Code
                  <input
                    autoComplete="one-time-code"
                    className={inputClassName}
                    inputMode="numeric"
                    name="code"
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    required
                    type="text"
                    value={code}
                  />
                </label>
                <div
                  className="min-h-0"
                  data-cl-language="auto"
                  data-cl-size="flexible"
                  data-cl-theme="auto"
                  id="clerk-captcha"
                />
                <button
                  className="action-link action-link-primary w-full"
                  data-analytics-event="account_verify_code_click"
                  data-analytics-location="code_step"
                  disabled={authBusy}
                  type="submit"
                >
                  {authBusy ? "Checking..." : "Verify code"}
                </button>
                <button
                  className="action-link action-link-secondary w-full"
                  disabled={authBusy}
                  onClick={() => {
                    void handleResendCode();
                  }}
                  data-analytics-event="account_resend_code_click"
                  data-analytics-location="code_step"
                  type="button"
                >
                  Resend code
                </button>
                <button
                  className="action-link action-link-secondary w-full"
                  disabled={authBusy}
                  onClick={() => {
                    trackParticipantAnalyticsEvent({
                      googleEventName: "account_change_email_clicked",
                      params: {
                        auth_step: "code",
                      },
                    });
                    setAuthStep("email");
                    setCode("");
                    setAuthError(null);
                    setStatusMessage(null);
                  }}
                  type="button"
                >
                  Use a different email
                </button>
              </form>
            )}
          </div>
        ) : null}

        {clerkFlowLoaded && isSignedIn && !isConnected ? (
          <div className="card-surface rounded-[2rem] p-5">
            <h2 className="mt-3 font-display text-2xl font-semibold">
              Use this email for the event
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Signed in as{" "}
              <span className="font-semibold">{clerkEmail ?? "your email"}</span>.
              Link it to this event to save your progress on other devices and to
              hear from the organizer later if needed.
            </p>
            {actionData?.error ? (
              <p className="mt-4 text-sm font-medium text-rose-700">
                {actionData.error}
              </p>
            ) : null}
            <Form className="mt-5" method="post">
              <button
                className="action-link action-link-primary w-full"
                data-analytics-event="account_link_email_click"
                data-analytics-location="link_step"
                type="submit"
              >
                Use this email
              </button>
            </Form>
          </div>
        ) : null}

        {isConnected ? (
          <div className="card-surface rounded-[2rem] p-5">
            <h2 className="mt-3 font-display text-2xl font-semibold">
              Email linked
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {session?.email
                ? `${session.email} is already attached to this event session.`
                : "This event session already has an email attached."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="back_to_tasks"
            data-analytics-event="account_navigation_click"
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

export default function EventAccount(props: Route.ComponentProps) {
  const themeStyle = getBrandingStyle(props.loaderData);

  if (!clerkEnabled) {
    return (
      <ScreenShell
        eyebrow="Participant account"
        title="Set your email"
        description="Email sign-in is not configured yet."
        marketing={{
          analytics: {
            account_connected: Boolean(props.loaderData.session?.participantAccountUuid),
            clerk_enabled: false,
            has_session_email: Boolean(props.loaderData.session?.email),
          },
          eventName: props.loaderData.event.name,
          eventSlug: props.loaderData.event.slug,
          page: "account",
          sessionKey: props.loaderData.session?.verificationCode ?? null,
          settings: props.loaderData.event.settingsJson,
        }}
        style={themeStyle}
      >
        <div className="space-y-4">
          <div className="card-surface rounded-[2rem] p-5">
            <p className="text-sm leading-6 text-slate-700">
              Add your Clerk publishable key and secret key to enable the email
              account flow.
            </p>
          </div>
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="back_to_tasks"
            data-analytics-event="account_navigation_click"
            data-analytics-location="footer"
            to={`/${props.params.eventSlug}/tasks`}
          >
            Back to activities
          </Link>
        </div>
      </ScreenShell>
    );
  }

  return <ClerkAccountContent {...props} />;
}
