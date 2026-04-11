import type { Route } from "./+types/home";
import { Link } from "react-router";

import { ScreenShell } from "../components/screen-shell";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Qianlu Events" },
    {
      name: "description",
      content: "Mobile-first event task app scaffold for Qianlu Events.",
    },
  ];
}

export default function Home() {
  return (
    <ScreenShell
      eyebrow="Monorepo scaffold"
      title="Qianlu Events platform starter"
      description="The web app, API, shared packages, and Prisma schema are in place. Start from the demo event flow below or continue with feature implementation."
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Demo route
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold">
            Preview the event flow skeleton
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Use the demo event route to inspect the participant landing page, task
            list, summary screen, and the hidden verification screen.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Link className="action-link action-link-primary" to="/demo-event">
              Open demo event
            </Link>
            <Link
              className="action-link action-link-secondary"
              to="/demo-event/tasks"
            >
              Jump straight to task list
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card-surface rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Current stack
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>React Router v7 in framework mode</li>
              <li>Fastify REST API</li>
              <li>Postgres + Prisma</li>
              <li>Tailwind + CSS variables</li>
            </ul>
          </div>
          <div className="card-surface rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Docs
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>`docs/product-brainstorm.md`</li>
              <li>`docs/v1-product-spec.md`</li>
              <li>`docs/technical-architecture.md`</li>
            </ul>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}
