import { Hono } from "hono";
import { listOffsets, offsetOf, offsetRules, setOffset } from "@/providers/xtream";
import { describeError } from "@/shared";
import { back, form, page } from "../http";
import { channelsOfGuide, epgGrid, gridFilters, programmesOf, type GridQuery } from "./data";
import { EpgView, OffsetPanel, SLOTS, SLOT_MIN } from "./view";

/** `/admin/epg`: the provider's guide as a grid, and the corrections of its times. */
export const epgRoutes = new Hono();

const HALF_HOUR = 30 * 60_000;
/** The window starts on the half hour before now, or at `at`. */
function windowOf(at: string | undefined): { from: Date; to: Date } {
  const t = at ? Date.parse(at) : NaN;
  const from = new Date(
    Number.isNaN(t) ? Math.floor(Date.now() / HALF_HOUR) * HALF_HOUR - HALF_HOUR : Math.floor(t / HALF_HOUR) * HALF_HOUR,
  );
  return { from, to: new Date(from.getTime() + SLOTS * SLOT_MIN * 60_000) };
}

/** Where « fermer » and a saved correction lead: back to the EPG page only, it lands in a link and a redirect. */
const epgBack = (url: string | undefined) => (url && /^\/admin\/epg(\/|\?|$)/.test(url) ? url : "/admin/epg");

/** The programmes of a guide id over the day of `at`, for the correction panel. */
async function panelProps(epgId: string, at: Date, minutes: number | null, pattern: string | null, backUrl: string) {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const [channels, programmes, rules] = await Promise.all([channelsOfGuide(epgId), programmesOf([epgId], start, end), offsetRules()]);
  const current = offsetOf(rules, epgId);
  const exactRule = rules.exact.has(epgId.toLowerCase());
  return {
    epgId,
    channels,
    programmes,
    current,
    preview: minutes ?? current,
    scope: (pattern ? (pattern.startsWith("*") ? "suffix" : "exact") : exactRule || !current ? "exact" : "suffix") as "exact" | "suffix",
    back: backUrl,
  };
}

epgRoutes.get("/", async (c) => {
  const { from, to } = windowOf(c.req.query("at"));
  const q: GridQuery = {
    from,
    to,
    q: c.req.query("q")?.trim() ?? "",
    market: c.req.query("market") ?? "",
    theme: c.req.query("theme") ?? "",
    page: Math.max(1, Number(c.req.query("page")) || 1),
  };
  const channel = c.req.query("channel");
  const url = new URL(c.req.url);
  url.searchParams.delete("channel");
  const [grid, filters, offsets, panel] = await Promise.all([
    epgGrid(q),
    gridFilters(),
    listOffsets(),
    channel ? panelProps(channel, from, null, null, url.pathname + url.search) : null,
  ]);
  return page(
    c,
    "EPG",
    <EpgView
      q={q}
      channels={grid.channels}
      total={grid.total}
      markets={filters.markets}
      themes={filters.themes}
      offsets={offsets}
      panel={panel && <OffsetPanel {...panel} />}
    />,
  );
});

/** htmx: the panel again with the programmes shifted by the chosen correction, nothing saved. */
epgRoutes.get("/preview/:id", async (c) => {
  const minutes = Number(c.req.query("minutes"));
  const props = await panelProps(
    c.req.param("id"),
    new Date(),
    Number.isFinite(minutes) ? minutes : null,
    c.req.query("pattern") ?? null,
    epgBack(c.req.query("back")),
  );
  return c.html(<OffsetPanel {...props} />);
});

epgRoutes.post("/offsets", async (c) => {
  const f = await form(c);
  const to = epgBack(f.back);
  const minutes = Number(f.minutes);
  try {
    const moved = await setOffset(f.pattern ?? "", minutes);
    return back(c, to, {
      ok: minutes
        ? `Correction ${f.pattern} enregistrée, ${moved} programmes déplacés`
        : `Correction ${f.pattern} retirée, ${moved} programmes déplacés`,
    });
  } catch (e) {
    return back(c, to, { err: describeError(e) });
  }
});
