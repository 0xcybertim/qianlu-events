import { isRouteErrorResponse, redirect } from "react-router";

import type { Route } from "./+types/admin-facebook-oauth-start";
import { startAdminFacebookOauth } from "../lib/api.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.eventSlug) {
    return redirect("/admin/events");
  }

  try {
    const result = await startAdminFacebookOauth(params.eventSlug, request);

    return redirect(result.location, {
      headers: result.headers,
    });
  } catch (error) {
    if (isRouteErrorResponse(error) && error.status === 401) {
      return redirect("/admin");
    }

    throw error;
  }
}
