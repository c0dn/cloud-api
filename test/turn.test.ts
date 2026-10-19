import { describe, expect, it, vi } from "vitest";
import { filterTurnUrls, generateCloudflareIceServer, getTurnTtlSeconds } from "../src/turn";

const CF_URLS = [
  "stun:stun.cloudflare.com:3478",
  "stun:stun.cloudflare.com:53",
  "turn:turn.cloudflare.com:3478?transport=udp",
  "turn:turn.cloudflare.com:53?transport=udp",
  "turn:turn.cloudflare.com:3478?transport=tcp",
  "turn:turn.cloudflare.com:80?transport=tcp",
  "turns:turn.cloudflare.com:5349?transport=tcp",
  "turns:turn.cloudflare.com:443?transport=tcp",
];

describe("filterTurnUrls", () => {
  it("keeps TURN over TLS and drops port 53 alternates", () => {
    expect(filterTurnUrls(CF_URLS)).toEqual([
      "stun:stun.cloudflare.com:3478",
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turn:turn.cloudflare.com:80?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
      "turns:turn.cloudflare.com:443?transport=tcp",
    ]);
  });

  it("accepts a single URL string", () => {
    expect(filterTurnUrls("turns:turn.cloudflare.com:443?transport=tcp")).toEqual([
      "turns:turn.cloudflare.com:443?transport=tcp",
    ]);
  });
});

describe("getTurnTtlSeconds", () => {
  it("defaults to 24h and accepts positive integers", () => {
    expect(getTurnTtlSeconds(undefined)).toBe(86400);
    expect(getTurnTtlSeconds("")).toBe(86400);
    expect(getTurnTtlSeconds("-5")).toBe(86400);
    expect(getTurnTtlSeconds("7200")).toBe(7200);
  });
});

describe("generateCloudflareIceServer", () => {
  it("requests credentials with the TTL and user identifier", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          iceServers: [
            { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
            { urls: CF_URLS.slice(2), username: "u", credential: "c" },
          ],
        }),
        { status: 201 },
      ),
    );

    const server = await generateCloudflareIceServer("42", {
      keyId: "key",
      token: "tok",
      ttl: 7200,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 7200, customIdentifier: "42" });
    expect(server).toHaveLength(2);
    expect(server[1].username).toBe("u");
    expect(server[1].urls).toContain("turns:turn.cloudflare.com:443?transport=tcp");
    expect(server[1].urls).not.toContain("turn:turn.cloudflare.com:53?transport=udp");
  });

  it("fails clearly without credentials or on an upstream error", async () => {
    await expect(generateCloudflareIceServer("1", { keyId: "", token: "" })).rejects.toThrow(
      /CLOUDFLARE_TURN_ID/,
    );
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(
      generateCloudflareIceServer("1", {
        keyId: "k",
        token: "t",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/401/);
  });
});
