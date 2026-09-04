import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

// `worker.fetch()` expects a request carrying incoming `cf` properties.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("hello-world worker", () => {
  it("greets the world by default", async () => {
    const request = new IncomingRequest("https://example.com/api/hello");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Hello, World!",
    });
  });

  it("greets a caller by name", async () => {
    const request = new IncomingRequest("https://example.com/api/hello?name=Bryce");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    await expect(response.json()).resolves.toMatchObject({
      message: "Hello, Bryce!",
    });
  });

  it("404s on unknown routes", async () => {
    const request = new IncomingRequest("https://example.com/nope");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });
});
