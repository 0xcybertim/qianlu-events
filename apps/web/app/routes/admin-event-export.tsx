import { redirect } from "react-router";

import type { Route } from "./+types/admin-event-export";
import { fetchAdminLeadsCsv } from "../lib/api.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const csv = await fetchAdminLeadsCsv(params.eventSlug, request);

    return new Response(csv.text, {
      headers: {
        "Content-Disposition": csv.disposition,
        "Content-Type": csv.contentType,
      },
    });
  } catch {
    return redirect("/admin");
  }
}

export default function AdminEventExport() {
  return null;
}

