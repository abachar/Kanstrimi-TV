import { Title } from "../ui";
import { ago, fmt, megabytes } from "../format";
import { CACHE_LABELS } from "../labels";
import type { CacheStat } from "./data";

export function CachesView({ rows }: { rows: CacheStat[] }) {
  return (
    <>
      <Title t="Caches" sub="Ce que le serveur garde pour ne pas redemander ; lecture seule" />
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        {rows.map((r) => {
          const l = CACHE_LABELS[r.id];
          return (
            <section class="card h-full">
              <header>
                <h2>{l.title}</h2>
                <p>{l.what}</p>
              </header>
              <section class="flex flex-col gap-1">
                <div class="text-3xl font-semibold tabular-nums tracking-tight">
                  {fmt(r.count)} <span class="text-sm font-normal text-muted-foreground">{l.unit}</span>
                </div>
                <div class="text-xs text-muted-foreground">
                  {megabytes(r.bytes)}
                  {r.oldest ? ` · plus ancien ${ago(r.oldest)}` : ""}
                  {r.newest ? ` · plus récent ${ago(r.newest)}` : ""}
                </div>
                <p class="mt-2 text-sm text-muted-foreground">{l.how}</p>
              </section>
            </section>
          );
        })}
      </div>
      <p class="text-sm text-muted-foreground">
        Les fichiers de <code class="font-mono text-foreground">DATA_DIR</code> (images, iptv-org, logs) se reconstruisent ; seule la base
        se sauvegarde.
      </p>
    </>
  );
}
