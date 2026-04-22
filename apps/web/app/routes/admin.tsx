import { Button } from "@qianlu-events/ui";
import { Form, redirect } from "react-router";

import type { Route } from "./+types/admin";
import {
  fetchAdminSession,
  forwardSetCookie,
  loginAdmin,
} from "../lib/api.server";
import { buildPageTitle } from "../lib/meta";
import { AdminCard, AdminField, AdminShell, adminInputClass } from "../components/admin-shell";

export function meta({}: Route.MetaArgs) {
  return [{ title: buildPageTitle("Admin Login") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const session = await fetchAdminSession(request);

    if (session.ok) {
      return redirect("/admin/events");
    }
  } catch {
    return {
      authUnavailable: false,
    };
  }

  return {
    authUnavailable: false,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!email || !password) {
    return {
      error: "Enter the admin email and password.",
      fields: { email },
    };
  }

  try {
    const response = await loginAdmin(email, password, request);

    return redirect("/admin/events", {
      headers: forwardSetCookie(response),
    });
  } catch {
    return {
      error: "Admin login failed. Check the account email and password.",
      fields: { email },
    };
  }
}

export default function AdminLogin({ actionData }: Route.ComponentProps) {
  return (
    <AdminShell
      title="Organizer login"
      description="Use your organizer account to manage events, tasks, leads, and reward reports."
    >
      <AdminCard className="max-w-md">
        <Form className="space-y-4" method="post">
          <AdminField label="Email">
            <input
              className={adminInputClass}
              defaultValue={actionData?.fields?.email ?? ""}
              name="email"
              placeholder="organizer@example.com"
              type="email"
            />
          </AdminField>
          <AdminField label="Password">
            <input
              className={adminInputClass}
              name="password"
              placeholder="Your organizer password"
              type="password"
            />
          </AdminField>
          {actionData?.error ? (
            <p className="text-sm font-medium text-rose-700">{actionData.error}</p>
          ) : null}
          <Button type="submit">Log in</Button>
        </Form>
      </AdminCard>
    </AdminShell>
  );
}
