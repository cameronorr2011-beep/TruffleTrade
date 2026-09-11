import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../core/research/ai";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const OK_BODY = {
  choices: [{ message: { content: "{\"stance\":\"neutral\"}" } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GroqProvider retry (regression: free-tier TPM 429s killed live agents)", () => {
  it("retries a 429 using the wait time in the error message and succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls++;
      return calls === 1
        ? Promise.resolve(jsonResponse(429, { error: { message: "Rate limit reached ... Please try again in 0.05s." } }))
        : Promise.resolve(jsonResponse(200, OK_BODY));
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new GroqProvider("test-key", "test-model");
    const r = await p.chatJson<{ stance: string }>([{ role: "user", content: "hi" }], "v1");
    expect(r.data.stance).toBe("neutral");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after max attempts and surfaces the rate-limit error", { timeout: 15_000 }, async () => {
    // Fresh Response per call — a Response body can only be consumed once.
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(429, { error: { message: "Rate limit reached ... Please try again in 0.05s." } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = new GroqProvider("test-key", "test-model");
    await expect(p.chatJson([{ role: "user", content: "hi" }], "v1")).rejects.toThrow(/after 4 attempts/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a 401 auth error", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(401, { error: { message: "Invalid API key" } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = new GroqProvider("bad-key", "test-model");
    await expect(p.chatJson([{ role: "user", content: "hi" }], "v1")).rejects.toThrow(/Invalid API key/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 500 and succeeds", { timeout: 15_000 }, async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls++;
      return calls === 1
        ? Promise.resolve(jsonResponse(500, { error: { message: "internal" } }))
        : Promise.resolve(jsonResponse(200, OK_BODY));
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new GroqProvider("test-key", "test-model");
    const r = await p.chatJson([{ role: "user", content: "hi" }], "v1");
    expect(r.data).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
