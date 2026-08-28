import { Hono } from "hono";
import fs from "node:fs";
import { Readable } from "node:stream";
import { authenticate, streamBase, streamUrl } from "@/lib/api/context";
import { listCategories, listItems, vodInfo, seriesInfo, isVisibleStream } from "@/lib/api/catalog";
import { EPG_PATH } from "@/lib/epg/rebuild";
import { ensureImage } from "@/lib/tmdb/images";

export const xtream = new Hono();

function fileResponse(path: string, contentType: string, cacheControl: string) {
  const size = fs.statSync(path).size;
  const body = Readable.toWeb(fs.createReadStream(path)) as unknown as ReadableStream;
  return new Response(body, { headers: { "Content-Type": contentType, "Content-Length": String(size), "Cache-Control": cacheControl } });
}

/**
 * "<id>.<ext>" where the id is whatever the provider used — not necessarily digits, and it
 * may itself contain dots. Only a short alphanumeric tail counts as the extension.
 */
function splitFile(file: string, fallbackExt: string): { id: string; ext: string } {
  const m = /^(.+?)\.([A-Za-z0-9]{2,5})$/.exec(file);
  if (m) return { id: m[1].trim(), ext: m[2] };
  return { id: file.trim(), ext: fallbackExt };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ---------------------------------------------------------------- player_api.php
async function playerApi(req: Request, params: URLSearchParams) {
  const ctx = await authenticate(req, params.get("username"), params.get("password"));
  if (!ctx) return json({ user_info: { auth: 0, status: "Disabled", message: "Invalid credentials" } }, 401);
  const action = params.get("action") ?? "";
  const categoryId = params.get("category_id");
  switch (action) {
    case "": {
      let up: Record<string, unknown> = {};
      let userInfo: Record<string, unknown> = {};
      try {
        const acct = await ctx.upstream.account();
        up = acct.server_info as unknown as Record<string, unknown>;
        userInfo = acct.user_info as unknown as Record<string, unknown>;
      } catch {
        userInfo = { auth: 1, status: "Active", exp_date: null, is_trial: "0", active_cons: "0", created_at: "0", max_connections: "1", allowed_output_formats: ["m3u8", "ts"] };
      }
      const sb = streamBase(ctx);
      const target = new URL(sb.base);
      const server_info = {
        ...up,
        url: target.hostname,
        port: target.port || (target.protocol === "https:" ? "443" : "80"),
        https_port: target.protocol === "https:" ? (target.port || "443") : (up.https_port ?? "443"),
        server_protocol: target.protocol.replace(":", ""),
        rtmp_port: up.rtmp_port ?? "",
        timezone: up.timezone ?? "UTC",
        timestamp_now: Math.floor(Date.now() / 1000),
        time_now: new Date().toISOString().slice(0, 19).replace("T", " "),
        process: true,
      };
      const user_info = { ...userInfo, username: sb.username, password: sb.password, auth: 1, status: userInfo.status ?? "Active" };
      return json({ user_info, server_info });
    }
    case "get_live_categories": return json(await listCategories("live"));
    case "get_vod_categories": return json(await listCategories("vod"));
    case "get_series_categories": return json(await listCategories("series"));
    case "get_live_streams": return json(await listItems(ctx, "live", categoryId));
    case "get_vod_streams": return json(await listItems(ctx, "vod", categoryId));
    case "get_series": return json(await listItems(ctx, "series", categoryId));
    case "get_vod_info": {
      const id = (params.get("vod_id") ?? "").trim();
      return json((id ? await vodInfo(ctx, id) : null) ?? { info: [], movie_data: [] });
    }
    case "get_series_info": {
      const id = (params.get("series_id") ?? "").trim();
      return json((id ? await seriesInfo(ctx, id) : null) ?? { seasons: [], info: [], episodes: [] });
    }
    case "get_short_epg":
    case "get_simple_data_table": {
      try {
        const extra: Record<string, string> = {};
        for (const k of ["stream_id", "limit"]) { const v = params.get(k); if (v) extra[k] = v; }
        return json(await ctx.upstream.call(action, extra));
      } catch { return json({ epg_listings: [] }); }
    }
    default:
      return json([]);
  }
}

xtream.get("/player_api.php", (c) => playerApi(c.req.raw, new URL(c.req.url).searchParams));
xtream.post("/player_api.php", async (c) => {
  const params = new URL(c.req.url).searchParams;
  try { for (const [k, v] of new URLSearchParams(await c.req.text())) params.set(k, v); } catch { /* ignore */ }
  return playerApi(c.req.raw, params);
});

// ---------------------------------------------------------------- get.php (M3U)
xtream.get("/get.php", async (c) => {
  const ctx = await authenticate(c.req.raw);
  if (!ctx) return c.text("Unauthorized", 401);
  const output = c.req.query("output") ?? "ts";
  const catNames = new Map<string, string>();
  for (const kind of ["live", "vod"] as const) for (const cat of await listCategories(kind)) catNames.set(`${kind}:${cat.category_id}`, String(cat.category_name));
  const esc = (s: unknown) => String(s ?? "").replace(/"/g, "'");
  const lines = ["#EXTM3U"];
  for (const it of await listItems(ctx, "live")) {
    lines.push(`#EXTINF:-1 tvg-id="${esc(it.epg_channel_id)}" tvg-name="${esc(it.name)}" tvg-logo="${esc(it.stream_icon)}" group-title="${esc(catNames.get(`live:${it.category_id}`))}",${it.name}`);
    lines.push(streamUrl(ctx, "live", String(it.stream_id), output === "m3u8" ? "m3u8" : "ts"));
  }
  for (const it of await listItems(ctx, "vod")) {
    lines.push(`#EXTINF:-1 tvg-name="${esc(it.name)}" tvg-logo="${esc(it.stream_icon)}" group-title="${esc(catNames.get(`vod:${it.category_id}`))}",${it.name}`);
    lines.push(streamUrl(ctx, "movie", String(it.stream_id), String(it.container_extension ?? "mp4")));
  }
  return c.body(lines.join("\n") + "\n", 200, {
    "Content-Type": "audio/x-mpegurl", "Content-Disposition": 'attachment; filename="playlist.m3u"', "Cache-Control": "no-store",
  });
});

// ---------------------------------------------------------------- xmltv.php
xtream.get("/xmltv.php", async (c) => {
  const ctx = await authenticate(c.req.raw);
  if (!ctx) return c.text("Unauthorized", 401);
  if (fs.existsSync(EPG_PATH)) {
    return fileResponse(EPG_PATH, "application/xml", "no-store");
  }
  try {
    const up = await fetch(ctx.upstream.xmltvUrl(), { redirect: "follow", signal: AbortSignal.timeout(120_000) });
    if (!up.ok || !up.body) return c.text("Upstream EPG unavailable", 502);
    return new Response(up.body, { headers: { "Content-Type": up.headers.get("content-type") ?? "application/xml", "Cache-Control": "no-store" } });
  } catch { return c.text("Upstream EPG unavailable", 502); }
});

// ---------------------------------------------------------------- stream redirects
for (const kind of ["live", "movie", "series"] as const) {
  xtream.get(`/${kind}/:user/:pass/:file`, async (c) => {
    const { user, pass, file } = c.req.param();
    const ctx = await authenticate(c.req.raw, decodeURIComponent(user), decodeURIComponent(pass));
    if (!ctx) return c.text("Unauthorized", 401);
    const { id, ext } = splitFile(file, kind === "live" ? "ts" : "mp4");
    if (!id) return c.text("Not found", 404);
    if (!(await isVisibleStream(kind, id))) return c.text("Not found", 404);
    return c.redirect(ctx.upstream.streamUrl(kind, id, ext) + new URL(c.req.url).search, 302);
  });
}

// ---------------------------------------------------------------- TMDB image cache
xtream.get("/img/:size/:file", async (c) => {
  const { size, file } = c.req.param();
  const img = await ensureImage(size, file).catch(() => null);
  if (!img) return c.text("Not found", 404);
  return fileResponse(img.path, img.contentType, "public, max-age=31536000, immutable");
});
