import { describe, expect, it } from "vitest";
import { normalizeReturnTo } from "../src/oidc";

describe("normalizeReturnTo", () => {
  const appHostname = "https://jetkvm.example.com";

  it("removes control characters from return URLs", () => {
    expect(
      normalizeReturnTo("https://jetkvm.example.com/\r\n\tdevices", appHostname),
    ).toBe("https://jetkvm.example.com/devices");
  });

  it("falls back when return URLs point off-origin", () => {
    expect(normalizeReturnTo("https://example.net/devices", appHostname)).toBe(
      "https://jetkvm.example.com/devices",
    );
  });

  it("allows relative return URLs on the app origin", () => {
    expect(normalizeReturnTo("/devices", appHostname)).toBe(
      "https://jetkvm.example.com/devices",
    );
  });
});

describe("normalizeReturnTo device adoption", () => {
  const appHostname = "https://jetkvm.example.com";
  const adopt = { allowDeviceAdopt: true };

  it("allows the KVM's LAN adopt page during adoption", () => {
    expect(normalizeReturnTo("http://192.168.40.50/adopt", appHostname, adopt)).toBe(
      "http://192.168.40.50/adopt",
    );
    expect(normalizeReturnTo("https://jetkvm-a1.local/adopt", appHostname, adopt)).toBe(
      "https://jetkvm-a1.local/adopt",
    );
    expect(normalizeReturnTo("http://[fd00::12]/adopt", appHostname, adopt)).toBe(
      "http://[fd00::12]/adopt",
    );
  });

  it("rejects device adopt URLs outside adoption", () => {
    expect(normalizeReturnTo("http://192.168.40.50/adopt", appHostname)).toBe(
      "https://jetkvm.example.com/devices",
    );
  });

  it("rejects public hosts, other paths and credentials during adoption", () => {
    for (const url of [
      "https://evil.example.net/adopt",
      "http://8.8.8.8/adopt",
      "http://192.168.40.50/steal",
      "http://user:pw@192.168.40.50/adopt",
      "javascript://192.168.40.50/adopt",
    ]) {
      expect(normalizeReturnTo(url, appHostname, adopt)).toBe(
        "https://jetkvm.example.com/devices",
      );
    }
  });
});
