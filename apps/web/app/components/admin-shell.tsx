import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

type AdminShellProps = {
  children: ReactNode;
  eventSlug?: string;
  title: string;
  description: string;
};

const eventNavItems = [
  { label: "Overview", to: "" },
  { label: "Marketing", to: "marketing" },
  { label: "Tasks", to: "tasks" },
  { label: "QR Codes", to: "qr-codes" },
  { label: "Participants", to: "participants" },
  { label: "Leads", to: "leads" },
  { label: "Rewards", to: "rewards" },
  { label: "Export", to: "export" },
];

export function AdminShell({
  children,
  description,
  eventSlug,
  title,
}: AdminShellProps) {
  return (
    <main className="min-h-screen w-full px-5 py-6 sm:px-10">
      <header className="flex flex-col gap-5 border-b border-[var(--color-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-primary)]"
            to="/admin/events"
          >
            Organizer panel
          </Link>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
            {description}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm font-semibold">
          <NavLink
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 ${
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                  : "bg-white/70 text-slate-700"
              }`
            }
            to="/admin/events"
          >
            Events
          </NavLink>
          {eventSlug
            ? eventNavItems.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 ${
                      isActive
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                        : "bg-white/70 text-slate-700"
                    }`
                  }
                  end={item.to === ""}
                  key={item.label}
                  to={`/admin/events/${eventSlug}${item.to ? `/${item.to}` : ""}`}
                >
                  {item.label}
                </NavLink>
              ))
            : null}
        </nav>
      </header>
      <section className="mt-6">{children}</section>
    </main>
  );
}

export function AdminCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-surface rounded-lg p-5 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function AdminField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const adminInputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none ring-[var(--color-primary)] focus:ring-2";
