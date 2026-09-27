/** Loosely typed Xtream Codes payloads — we keep raw objects and only read what we need. */
export type XCategory = { category_id: string | number; category_name: string; parent_id?: number | string };
export type XStream = Record<string, unknown> & {
  num?: number; name: string; stream_id?: number; series_id?: number;
  category_id?: string | number | null; category_ids?: (string | number)[];
  stream_icon?: string; cover?: string; container_extension?: string; direct_source?: string;
  added?: string; last_modified?: string; rating?: string | number; rating_5based?: number;
  plot?: string; genre?: string; releaseDate?: string; releasedate?: string; backdrop_path?: string[];
  cast?: string; director?: string; youtube_trailer?: string; tmdb?: string | number;
};
export type XUserInfo = {
  username: string; password: string; message?: string; auth: number; status: string;
  exp_date?: string | null; is_trial?: string; active_cons?: string | number; created_at?: string;
  max_connections?: string | number; allowed_output_formats?: string[];
};
export type XServerInfo = {
  url: string; port: string; https_port?: string; server_protocol: string; rtmp_port?: string;
  timezone?: string; timestamp_now?: number; time_now?: string; process?: boolean;
};
export type XAccount = { user_info: XUserInfo; server_info: XServerInfo };

export class XtreamError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

/** Minimal Xtream Codes API client for the upstream provider. */
export class XtreamClient {
  readonly base: string;
  constructor(url: string, readonly username: string, readonly password: string) {
    this.base = url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(this.base)) this.base = "http://" + this.base;
  }

  private url(action?: string, extra: Record<string, string | number> = {}) {
    const u = new URL(this.base + "/player_api.php");
    u.searchParams.set("username", this.username);
    u.searchParams.set("password", this.password);
    if (action) u.searchParams.set("action", action);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async call<T>(action?: string, extra: Record<string, string | number> = {}, timeoutMs = 60_000): Promise<T> {
    const res = await fetch(this.url(action, extra), {
      headers: { "User-Agent": "Kanstrimi/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new XtreamError(`Upstream ${action ?? "auth"} failed: HTTP ${res.status}`, res.status);
    const text = await res.text();
    try { return JSON.parse(text) as T; }
    catch { throw new XtreamError(`Upstream ${action ?? "auth"} returned invalid JSON: ${text.slice(0, 200)}`); }
  }

  account() { return this.call<XAccount>(); }
  liveCategories() { return this.call<XCategory[]>("get_live_categories"); }
  vodCategories() { return this.call<XCategory[]>("get_vod_categories"); }
  seriesCategories() { return this.call<XCategory[]>("get_series_categories"); }
  liveStreams() { return this.call<XStream[]>("get_live_streams", {}, 120_000); }
  vodStreams() { return this.call<XStream[]>("get_vod_streams", {}, 180_000); }
  series() { return this.call<XStream[]>("get_series", {}, 180_000); }
  vodInfo(vodId: string | number) { return this.call<Record<string, unknown>>("get_vod_info", { vod_id: vodId }); }
  seriesInfo(seriesId: string | number) { return this.call<Record<string, unknown>>("get_series_info", { series_id: seriesId }); }

  /** Absolute URL of a stream on the upstream server. */
  streamUrl(kind: "live" | "movie" | "series", id: number | string, ext: string) {
    return `${this.base}/${kind}/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${id}.${ext}`;
  }
  xmltvUrl() {
    return `${this.base}/xmltv.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
  }
  m3uUrl(type = "m3u_plus", output = "ts") {
    return `${this.base}/get.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&type=${type}&output=${output}`;
  }
}
