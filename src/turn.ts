/**
 * Cloudflare Realtime TURN credentials for browser clients.
 *
 * Only the browser receives TURN credentials: the KVM keeps STUN-only ICE
 * servers (ICE_SERVERS) and reaches the browser's relay candidate directly.
 */

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const DEFAULT_TURN_TTL_SECONDS = 86400;

/**
 * Credentials must outlive the longest expected KVM session; Cloudflare does
 * not refresh them mid-call. Defaults to 24h.
 */
export const getTurnTtlSeconds = (value = process.env.TURN_TTL) => {
  const ttl = Number.parseInt(value ?? "", 10);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TURN_TTL_SECONDS;
};

/**
 * Keep TURN-over-TLS (`turns:`) URLs: on networks that only allow outbound
 * TCP 443, `turns:turn.cloudflare.com:443?transport=tcp` is the only path
 * that works. Drop port 53 alternates, which browsers block and which only
 * add ICE gathering timeouts.
 */
export const filterTurnUrls = (urls: string | string[]) => {
  const list = Array.isArray(urls) ? urls : [urls];
  return list.filter(url => !/^(stuns?|turns?):[^?]*:53(\?|$)/.test(url));
};

export const generateCloudflareIceServer = async (
  customIdentifier: string,
  {
    keyId = process.env.CLOUDFLARE_TURN_ID,
    token = process.env.CLOUDFLARE_TURN_TOKEN,
    ttl = getTurnTtlSeconds(),
    fetchImpl = fetch,
  }: {
    keyId?: string;
    token?: string;
    ttl?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<IceServer[]> => {
  if (!keyId || !token) {
    throw new Error("CLOUDFLARE_TURN_ID and CLOUDFLARE_TURN_TOKEN must be set");
  }

  const resp = await fetchImpl(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl, customIdentifier }),
    },
  );

  if (!resp.ok) {
    throw new Error(`Cloudflare TURN credential request failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { iceServers?: IceServer[] };
  if (!Array.isArray(data.iceServers)) {
    throw new Error("No ice servers returned");
  }

  const servers = data.iceServers
    .map(server => ({ ...server, urls: filterTurnUrls(server.urls) }))
    .filter(server => server.urls.length > 0);
  if (!servers.some(server => server.username && server.credential)) {
    throw new Error("No usable TURN server returned");
  }

  return servers;
};
