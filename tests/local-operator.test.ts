import { describe, expect, it, afterEach } from "vitest";
import { isLocalOperator } from "../src/lib/guard";

function reqWith(headers: Record<string, string>, url = "http://localhost:3210/api/eco/insights"): Request {
  return new Request(url, { headers });
}

afterEach(() => {
  delete process.env.TT_LOCAL_OPERATOR;
});

describe("isLocalOperator (loopback operator mode)", () => {
  it("accepts a genuine local request (Next injects x-forwarded-for: ::1)", () => {
    const req = reqWith({ host: "localhost:3210", "x-forwarded-for": "::1" });
    expect(isLocalOperator(req)).toBe(true);
  });

  it("accepts a direct local request with no forwarded header", () => {
    const req = reqWith({ host: "127.0.0.1:3210", "x-forwarded-for": "127.0.0.1" });
    expect(isLocalOperator(req)).toBe(true);
  });

  it("rejects a spoofed loopback x-forwarded-for from the public internet", () => {
    // Attacker sends x-forwarded-for: ::1 — but the proxy APPENDS their real IP.
    const req = reqWith(
      { host: "truffletrade.vercel.app", "x-forwarded-for": "::1, 203.0.113.7" },
      "https://truffletrade.vercel.app/api/eco/insights",
    );
    expect(isLocalOperator(req)).toBe(false);
  });

  it("rejects public traffic even if xff has one hop", () => {
    const req = reqWith(
      { host: "truffletrade.vercel.app", "x-forwarded-for": "203.0.113.7" },
      "https://truffletrade.vercel.app/api/eco/insights",
    );
    expect(isLocalOperator(req)).toBe(false);
  });

  it("rejects a public domain host with a loopback last hop (host gate)", () => {
    const req = reqWith(
      { host: "truffletrade.vercel.app", "x-forwarded-for": "::1" },
      "https://truffletrade.vercel.app/api/eco/insights",
    );
    expect(isLocalOperator(req)).toBe(false);
  });

  it("rejects non-loopback hosts on a local network (192.168.x)", () => {
    const req = reqWith({ host: "192.168.1.50:3210", "x-forwarded-for": "192.168.1.9" }, "http://192.168.1.50:3210/api/eco/insights");
    expect(isLocalOperator(req)).toBe(false);
  });

  it("can be disabled with TT_LOCAL_OPERATOR=0", () => {
    process.env.TT_LOCAL_OPERATOR = "0";
    const req = reqWith({ host: "localhost:3210", "x-forwarded-for": "::1" });
    expect(isLocalOperator(req)).toBe(false);
  });
});
