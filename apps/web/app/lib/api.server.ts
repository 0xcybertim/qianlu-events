import { data } from "react-router";

import {
  adminEventDetailSchema,
  adminFacebookCommentDebugResponseSchema,
  adminFacebookConnectionDebugSchema,
  adminFacebookPostOptionsResponseSchema,
  adminInstagramCommentDebugResponseSchema,
  adminInstagramConnectionDebugSchema,
  adminInstagramMediaOptionsResponseSchema,
  adminInstagramPendingConnectionSchema,
  adminEventsResponseSchema,
  adminFacebookPendingConnectionSchema,
  adminLeadsResponseSchema,
  adminParticipantsResponseSchema,
  adminQrCodesResponseSchema,
  adminRewardsReportSchema,
  adminSessionResponseSchema,
  adminTaskSchema,
  eventWithTasksSchema,
  experienceResponseSchema,
  participantSessionSchema,
  participantLoginLinkConsumeResponseSchema,
  participantLoginLinkRequestResponseSchema,
  staffSessionLookupResponseSchema,
} from "@qianlu-events/schemas";

type ApiRequestOptions = {
  request?: Request;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
  body?: unknown;
  headers?: HeadersInit;
};

function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL ??
    process.env.VITE_API_BASE_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3001"
  );
}

export function forwardSetCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");

  return setCookie ? { "Set-Cookie": setCookie } : undefined;
}

async function apiRequest({
  body,
  headers: customHeaders,
  method = "GET",
  path,
  request,
}: ApiRequestOptions) {
  const headers = new Headers(customHeaders);

  if (body) {
    headers.set("Content-Type", "application/json");
  }

  if (typeof document === "undefined" && request) {
    const cookie = request.headers.get("Cookie");

    if (cookie) {
      headers.set("Cookie", cookie);
    }
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw data(await response.json(), {
      status: response.status,
      headers: forwardSetCookie(response),
    });
  }

  return response;
}

async function apiRequestWithManualRedirect(path: string, request?: Request) {
  const headers = new Headers();

  if (typeof document === "undefined" && request) {
    const cookie = request.headers.get("Cookie");

    if (cookie) {
      headers.set("Cookie", cookie);
    }
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers,
    credentials: "include",
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  if (!response.ok) {
    throw data(await response.json(), {
      status: response.status,
      headers: forwardSetCookie(response),
    });
  }

  throw data(
    {
      message: "Expected redirect response from API.",
    },
    {
      status: 502,
    },
  );
}

export async function postApi(path: string, body: unknown, request?: Request) {
  return apiRequest({
    method: "POST",
    path,
    body,
    request,
  });
}

export async function loginAdmin(
  email: string,
  password: string,
  request?: Request,
) {
  return postApi(
    "/admin/auth/login",
    {
      email,
      password,
    },
    request,
  );
}

export async function startAdminFacebookOauth(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequestWithManualRedirect(
    `/admin/events/${encodeURIComponent(eventSlug)}/facebook-oauth/start`,
    request,
  );
  const location = response.headers.get("location");

  if (!location) {
    throw data(
      {
        message: "Facebook OAuth redirect location missing.",
      },
      {
        status: 502,
      },
    );
  }

  return {
    headers: forwardSetCookie(response),
    location,
  };
}

export async function startAdminInstagramOauth(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequestWithManualRedirect(
    `/admin/events/${encodeURIComponent(eventSlug)}/instagram-oauth/start`,
    request,
  );
  const location = response.headers.get("location");

  if (!location) {
    throw data(
      {
        message: "Instagram OAuth redirect location missing.",
      },
      {
        status: 502,
      },
    );
  }

  return {
    headers: forwardSetCookie(response),
    location,
  };
}

export async function fetchAdminSession(request?: Request) {
  const response = await apiRequest({
    path: "/admin/auth/session",
    request,
  });

  return adminSessionResponseSchema.parse(await response.json());
}

export async function fetchAdminEvents(request?: Request) {
  const response = await apiRequest({
    path: "/admin/events",
    request,
  });

  return adminEventsResponseSchema.parse(await response.json());
}

export async function createAdminEvent(body: unknown, request?: Request) {
  const response = await apiRequest({
    method: "POST",
    path: "/admin/events",
    body,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function fetchAdminEvent(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}`,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function updateAdminEvent(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "PATCH",
    path: `/admin/events/${encodeURIComponent(eventSlug)}`,
    body,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function createAdminTask(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/tasks`,
    body,
    request,
  });

  return adminTaskSchema.parse(await response.json());
}

export async function saveAdminFacebookConnection(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/facebook-connection`,
    body,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function fetchAdminFacebookPendingConnection(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/facebook-connection/pending`,
    request,
  });

  return adminFacebookPendingConnectionSchema
    .nullable()
    .parse(await response.json());
}

export async function fetchAdminFacebookConnectionDebug(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/facebook-connection/debug`,
    request,
  });

  return adminFacebookConnectionDebugSchema
    .nullable()
    .parse(await response.json());
}

export async function saveAdminInstagramConnection(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/instagram-connection`,
    body,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function fetchAdminInstagramPendingConnection(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/instagram-connection/pending`,
    request,
  });

  return adminInstagramPendingConnectionSchema
    .nullable()
    .parse(await response.json());
}

export async function fetchAdminInstagramConnectionDebug(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/instagram-connection/debug`,
    request,
  });

  return adminInstagramConnectionDebugSchema
    .nullable()
    .parse(await response.json());
}

export async function fetchAdminFacebookCommentDebug(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/facebook-comment-debug`,
    request,
  });

  return adminFacebookCommentDebugResponseSchema.parse(await response.json());
}

export async function fetchAdminInstagramCommentDebug(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/instagram-comment-debug`,
    request,
  });

  return adminInstagramCommentDebugResponseSchema.parse(await response.json());
}

export async function fetchAdminFacebookPostOptions(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/facebook-post-options`,
    request,
  });

  return adminFacebookPostOptionsResponseSchema.parse(await response.json());
}

export async function fetchAdminInstagramMediaOptions(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/instagram-media-options`,
    request,
  });

  return adminInstagramMediaOptionsResponseSchema.parse(await response.json());
}

export async function selectAdminFacebookConnection(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/facebook-connection/select`,
    body,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function selectAdminInstagramConnection(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/instagram-connection/select`,
    body,
    request,
  });

  return adminEventDetailSchema.parse(await response.json());
}

export async function updateAdminTask(
  eventSlug: string,
  taskId: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "PATCH",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/tasks/${encodeURIComponent(
      taskId,
    )}`,
    body,
    request,
  });

  return adminTaskSchema.parse(await response.json());
}

export async function disableAdminTask(
  eventSlug: string,
  taskId: string,
  request?: Request,
) {
  const response = await apiRequest({
    method: "DELETE",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/tasks/${encodeURIComponent(
      taskId,
    )}`,
    request,
  });

  return adminTaskSchema.parse(await response.json());
}

export async function fetchAdminParticipants(
  eventSlug: string,
  request?: Request,
) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/participants`,
    request,
  });

  return adminParticipantsResponseSchema.parse(await response.json());
}

export async function fetchAdminLeads(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/leads`,
    request,
  });

  return adminLeadsResponseSchema.parse(await response.json());
}

export async function fetchAdminQrCodes(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/qr-codes`,
    request,
  });

  return adminQrCodesResponseSchema.parse(await response.json());
}

export async function createAdminQrCode(
  eventSlug: string,
  body: unknown,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: `/admin/events/${encodeURIComponent(eventSlug)}/qr-codes`,
    body,
    request,
  });

  return adminQrCodesResponseSchema.shape.qrCodes.element.parse(
    await response.json(),
  );
}

export async function fetchAdminRewards(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/rewards`,
    request,
  });

  return adminRewardsReportSchema.parse(await response.json());
}

export async function fetchAdminLeadsCsv(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/admin/events/${encodeURIComponent(eventSlug)}/export.csv`,
    request,
  });

  return {
    text: await response.text(),
    contentType: response.headers.get("content-type") ?? "text/csv; charset=utf-8",
    disposition:
      response.headers.get("content-disposition") ??
      `attachment; filename="${eventSlug}-leads.csv"`,
  };
}

export async function fetchEvent(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/events/${eventSlug}`,
    request,
  });

  return eventWithTasksSchema.parse(await response.json());
}

export async function fetchExperience(eventSlug: string, request?: Request) {
  const response = await apiRequest({
    path: `/events/${eventSlug}/experience`,
    request,
  });
  const payload = experienceResponseSchema.parse(await response.json());

  if (payload.session) {
    return data(payload, {
      headers: forwardSetCookie(response),
    });
  }

  const sessionResponse = await apiRequest({
    method: "POST",
    path: "/sessions",
    request,
    body: { eventSlug },
  });
  const session = experienceResponseSchema.shape.session.unwrap().parse(
    await sessionResponse.json(),
  );

  return data(
    {
      event: payload.event,
      session,
    },
    {
      headers: forwardSetCookie(sessionResponse),
    },
  );
}

export async function requestParticipantLoginLink(
  eventSlug: string,
  email: string,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: "/participant-auth/login-link",
    body: {
      email,
      eventSlug,
    },
    request,
  });

  return participantLoginLinkRequestResponseSchema.parse(await response.json());
}

export async function linkParticipantClerkAccount(
  eventSlug: string,
  clerkToken: string,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: "/participant-auth/clerk-link",
    body: {
      eventSlug,
    },
    headers: {
      Authorization: `Bearer ${clerkToken}`,
    },
    request,
  });

  return {
    headers: forwardSetCookie(response),
    payload: participantLoginLinkConsumeResponseSchema.parse(await response.json()),
  };
}

export async function consumeParticipantLoginLink(
  token: string,
  request?: Request,
) {
  const response = await apiRequest({
    method: "POST",
    path: "/participant-auth/consume-login-link",
    body: {
      token,
    },
    request,
  });

  return {
    headers: forwardSetCookie(response),
    payload: participantLoginLinkConsumeResponseSchema.parse(await response.json()),
  };
}

export async function parseParticipantSessionResponse(response: Response) {
  return participantSessionSchema.parse(await response.json());
}

export async function fetchStaffSession(args: {
  eventSlug: string;
  pin: string;
  request?: Request;
  verificationCode: string;
}) {
  const response = await apiRequest({
    headers: {
      "x-staff-pin": args.pin,
    },
    path: `/staff/events/${encodeURIComponent(args.eventSlug)}/sessions/${encodeURIComponent(
      args.verificationCode,
    )}`,
    request: args.request,
  });

  return staffSessionLookupResponseSchema.parse(await response.json());
}

export async function postStaffTaskDecision(args: {
  action: "approve" | "reject";
  eventSlug: string;
  pin: string;
  request?: Request;
  taskAttemptId: string;
  verificationCode: string;
}) {
  const response = await postApi(
    `/staff/events/${encodeURIComponent(args.eventSlug)}/sessions/${encodeURIComponent(
      args.verificationCode,
    )}/task-attempts/${encodeURIComponent(args.taskAttemptId)}/${args.action}`,
    {
      pin: args.pin,
    },
    args.request,
  );

  return staffSessionLookupResponseSchema.parse(await response.json());
}
