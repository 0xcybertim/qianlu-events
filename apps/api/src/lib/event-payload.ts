import { eventWithTasksSchema } from "@qianlu-events/schemas";

export function serializeEventForClient(event: unknown) {
  return eventWithTasksSchema.parse(event);
}
