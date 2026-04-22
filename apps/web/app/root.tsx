import { ClerkProvider } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  "";
const clerkSecretKey = import.meta.env.SSR
  ? (process.env.CLERK_SECRET_KEY ?? "")
  : "";
const clerkEnabled =
  Boolean(clerkPublishableKey) &&
  (import.meta.env.SSR ? Boolean(clerkSecretKey) : true);

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
  },
];

export function meta() {
  return [
    { title: "Qianlu Events" },
    {
      name: "description",
      content: "Mobile-first event engagement and rewards platform.",
    },
  ];
}

export const middleware = clerkEnabled ? [clerkMiddleware()] : [];

export async function loader(args: Route.LoaderArgs) {
  if (!clerkEnabled) {
    return null;
  }

  return rootAuthLoader(args);
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  if (!clerkEnabled) {
    return <Outlet />;
  }

  return (
    <ClerkProvider loaderData={loaderData} publishableKey={clerkPublishableKey}>
      <Outlet />
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="card-surface rounded-[2rem] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-primary)]">
          Qianlu Events
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold">{message}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">{details}</p>
      </div>
      {stack && (
        <pre className="mt-4 overflow-x-auto rounded-3xl bg-slate-950 p-4 text-xs text-slate-100">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
