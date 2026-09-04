/**
 * A minimal Cloudflare Worker.
 *
 * Static assets in ./public are served from the edge before this handler runs,
 * so `fetch` only sees requests that don't match a file.
 */
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/hello") {
      const name = url.searchParams.get("name") ?? "World";
      return Response.json({
        message: `Hello, ${name}!`,
        colo: request.cf?.colo ?? null,
        timestamp: new Date().toISOString(),
      });
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
