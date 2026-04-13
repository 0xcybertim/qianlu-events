import { Link } from "react-router";

import type { Route } from "./+types/privacy";
import { ScreenShell } from "../components/screen-shell";

const sections = [
  {
    title: "What This Service Does",
    body: [
      "Qianlu Events is an event engagement platform that lets organizers configure event tasks, collect participant submissions, and verify eligible actions such as Facebook comment tasks.",
      "Organizers can connect a Facebook Page to an event so the platform can match Facebook comment events to participant verification codes and mark tasks as verified automatically.",
    ],
  },
  {
    title: "Information We Process",
    body: [
      "For organizer accounts, we process account details, event access roles, connected Facebook Page IDs, Facebook Page names, and Facebook Page access tokens stored server-side.",
      "For participant sessions, we process event participation records such as verification codes, optional names and emails, task attempts, proof metadata, verified points, and reward eligibility.",
      "For Facebook verification, we process webhook payloads, matched Facebook comment IDs, Facebook post IDs, comment text used for verification, and audit metadata showing how the verification was performed.",
    ],
  },
  {
    title: "How We Use Data",
    body: [
      "We use organizer and participant data to operate event tasks, validate submissions, prevent duplicate or fraudulent rewards, calculate reward eligibility, and support organizer reporting.",
      "We use Facebook Page data only to connect an event to the selected Page, receive comment verification events, and verify the configured Facebook comment task for that event.",
    ],
  },
  {
    title: "Data Sharing",
    body: [
      "We do not expose Facebook Page access tokens to the browser or to participants. Tokens are stored server-side and are used only for approved Graph API requests required by the connected event.",
      "We may share data with infrastructure providers that host the application and database, but only to the extent required to operate the service.",
    ],
  },
  {
    title: "Retention",
    body: [
      "Organizer connections, participant task attempts, and verification logs are retained for as long as needed to operate the event, resolve disputes, prevent abuse, and maintain auditability.",
      "Facebook webhook and verification records may be retained after an event ends when needed for accounting, fraud prevention, or support investigations.",
    ],
  },
  {
    title: "Your Choices",
    body: [
      "Organizers can disconnect a Facebook Page by updating the event connection settings in the organizer panel or by contacting support.",
      "Participants and organizers can request access, correction, or deletion of personal data by contacting the support address listed below.",
    ],
  },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy Policy | Qianlu Events" },
    {
      name: "description",
      content:
        "Privacy policy for Qianlu Events, including organizer Facebook Page connections and participant task verification.",
    },
  ];
}

export default function PrivacyPage() {
  return (
    <ScreenShell
      eyebrow="Legal"
      title="Privacy Policy"
      description="This page explains how Qianlu Events processes organizer, participant, and Facebook integration data."
      width="wide"
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5 text-sm leading-7 text-slate-700">
          <p>
            Effective date: April 12, 2026
          </p>
          <p className="mt-3">
            If you have privacy questions or want to request deletion or
            correction of your data, contact{" "}
            <a
              className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              href="mailto:info@glemma.nl"
            >
              info@glemma.nl
            </a>
            .
          </p>
        </div>

        {sections.map((section) => (
          <section className="card-surface rounded-[2rem] p-5" key={section.title}>
            <h2 className="font-display text-2xl font-semibold text-[var(--color-text)]">
              {section.title}
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        <section className="card-surface rounded-[2rem] p-5">
          <h2 className="font-display text-2xl font-semibold text-[var(--color-text)]">
            Contact
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
            <p>Controller / support contact: Glemma / Qianlu Events</p>
            <p>Email: <a className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline" href="mailto:info@glemma.nl">info@glemma.nl</a></p>
            <p>
              Main site:{" "}
              <Link
                className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                to="/"
              >
                Qianlu Events
              </Link>
            </p>
          </div>
        </section>
      </div>
    </ScreenShell>
  );
}
