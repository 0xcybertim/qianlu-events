import { redirect } from "react-router";

import type { Route } from "./+types/event-account-verify";
import { consumeParticipantLoginLink } from "../lib/api.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return redirect(`/${params.eventSlug}/account`);
  }

  try {
    const result = await consumeParticipantLoginLink(token, request);

    return redirect(`/${result.payload.eventSlug}/tasks`, {
      headers: result.headers,
    });
  } catch {
    return redirect(`/${params.eventSlug}/account`);
  }
}
