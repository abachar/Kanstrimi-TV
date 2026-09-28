import { Title } from "../ui";
import { ago, fmt } from "../format";
import { CACHE_LABELS } from "../labels";
import type { CacheStat } from "./data";

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e6 ? 2 : 1)} Mo`;

export function CachesView({ rows }: { rows: CacheStat[] }) {
  return (
    <>
      <Title t="Caches" sub="Ce que le serveur garde pour ne pas redemander ; lecture seule" />
      <div class="row g-3">
        {rows.map((r) => {
          const l = CACHE_LABELS[r.id];
          return (
            <div class="col-12 col-md-6">
              <div class="card h-100">
                <div class="card-body">
                  <div class="fw-semibold">{l.title}</div>
                  <p class="text-secondary small mb-2">{l.what}</p>
                  <div class="display-6 fw-bold">
                    {fmt(r.count)} <small class="fs-6 fw-normal text-secondary">{l.unit}</small>
                  </div>
                  <div class="small text-secondary">
                    {mb(r.bytes)}
                    {r.oldest ? ` · plus ancien ${ago(r.oldest)}` : ""}
                    {r.newest ? ` · plus récent ${ago(r.newest)}` : ""}
                  </div>
                  <p class="small text-secondary mt-2 mb-0">{l.how}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p class="text-secondary small mt-3">
        Les fichiers (<code>DATA_DIR</code> : images, EPG) se reconstruisent ; seule la base se sauvegarde.
      </p>
    </>
  );
}
