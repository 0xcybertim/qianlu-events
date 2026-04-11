import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin/events", "routes/admin-events.tsx"),
  route("admin/events/:eventSlug", "routes/admin-event.tsx"),
  route(
    "admin/events/:eventSlug/facebook-oauth/start",
    "routes/admin-facebook-oauth-start.ts",
  ),
  route("admin/events/:eventSlug/tasks", "routes/admin-event-tasks.tsx"),
  route("admin/events/:eventSlug/qr-codes", "routes/admin-event-qr-codes.tsx"),
  route(
    "admin/events/:eventSlug/participants",
    "routes/admin-event-participants.tsx",
  ),
  route("admin/events/:eventSlug/leads", "routes/admin-event-leads.tsx"),
  route("admin/events/:eventSlug/rewards", "routes/admin-event-rewards.tsx"),
  route("admin/events/:eventSlug/export", "routes/admin-event-export.tsx"),
  route(":eventSlug", "routes/event-landing.tsx"),
  route(":eventSlug/tasks", "routes/event-tasks.tsx"),
  route(":eventSlug/tasks/:taskId", "routes/event-task.tsx"),
  route(":eventSlug/scan", "routes/event-scan-camera.tsx"),
  route(":eventSlug/scan/:token", "routes/event-scan.tsx"),
  route(":eventSlug/summary", "routes/event-summary.tsx"),
  route(":eventSlug/staff", "routes/event-staff.tsx"),
  route(":eventSlug/verify", "routes/event-verify.tsx"),
  route("health", "routes/health.ts"),
] satisfies RouteConfig;
