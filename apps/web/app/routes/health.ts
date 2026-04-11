export async function loader() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "@qianlu-events/web",
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
