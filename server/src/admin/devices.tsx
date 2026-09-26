import type { Device } from "@/db/schema";
import { ago, fmt } from "./layout";

const Title = ({ t, sub }: { t: string; sub: string }) => <div class="mb-4"><h1 class="h2 mb-1">{t}</h1><p class="text-secondary mb-0">{sub}</p></div>;

/** `/admin/pair/{code}`, opened from the QR code on the TV: name it, confirm. */
export function PairView({ code, state, error }: { code: string; state: "pending" | "expired" | "done" | "unknown"; error?: string }) {
  const display = `${code.slice(0, 3)}-${code.slice(3)}`;
  return (
    <div class="col-12 col-sm-8 col-md-6 col-lg-4 mx-auto mt-4"><div class="card"><div class="card-body">
      <h2 class="h4 mb-1">Ajouter cet Apple TV ?</h2>
      <p class="text-secondary">Code affiché sur la télévision : <span class="fs-4 font-monospace">{display}</span></p>
      {error && <div class="alert alert-danger" role="alert">{error}</div>}
      {state === "pending" && (
        <form method="post" action={`/admin/pair/${code}`} class="vstack gap-2">
          <label class="form-label mb-0" for="device-name">Nom de l'appareil</label>
          <input class="form-control" id="device-name" name="name" value="Salon" maxlength={40} required autofocus />
          <button class="btn btn-primary">Confirmer</button>
        </form>
      )}
      {state === "done" && <div class="alert alert-success mb-0" role="status">C'est fait : la télévision se connecte d'elle-même dans les secondes qui viennent.</div>}
      {state === "expired" && <div class="alert alert-warning mb-0" role="alert">Ce code a expiré. La télévision en affiche un nouveau toute seule : scannez-le à nouveau.</div>}
      {state === "unknown" && <div class="alert alert-warning mb-0" role="alert">Code inconnu. Vérifiez le code affiché sur la télévision.</div>}
      <p class="small text-secondary mt-3 mb-0"><a href="/admin/devices">Tous les appareils</a></p>
    </div></div></div>
  );
}

const STATUS: Record<string, [string, string]> = { pending: ["En attente", "secondary"], approved: ["Appairé", "success"], revoked: ["Dissocié", "danger"] };

export function DevicesView({ devices }: { devices: Device[] }) {
  return (
    <>
      <Title t="Appareils" sub="Les Apple TV appairées à ce serveur et leurs jetons" />
      <div class="list-group mb-3">
        {devices.map((d) => {
          const [label, cls] = STATUS[d.status] ?? [d.status, "secondary"];
          const expired = d.status === "pending" && d.expiresAt.getTime() < Date.now();
          return (
            <div class="list-group-item"><div class="row g-2 align-items-center">
              <div class="col-12 col-md-4"><span class="fw-semibold">{d.name ?? "(sans nom)"}</span> <code class="ms-1">{d.code}</code></div>
              <div class="col-6 col-md-2"><span class={`badge text-bg-${expired ? "secondary" : cls}`}>{expired ? "Expiré" : label}</span></div>
              <div class="col-6 col-md-3 small text-secondary">
                {d.status === "approved" ? <>vu {ago(d.lastSeenAt?.toISOString())}{d.lastIp ? ` · ${d.lastIp}` : ""}</> : d.status === "pending" ? <>créé {ago(d.createdAt.toISOString())}</> : <>appairé {ago(d.approvedAt?.toISOString())}</>}
              </div>
              <div class="col-12 col-md-3 d-flex gap-1 justify-content-md-end">
                {d.status === "pending" && !expired && <a class="btn btn-sm btn-primary" href={`/admin/pair/${d.code}`}>Approuver</a>}
                {d.status === "approved" && <form method="post" action={`/admin/devices/${d.code}/revoke`} onsubmit="return confirm('Dissocier cet appareil ? Il devra être appairé à nouveau.')"><button class="btn btn-sm btn-outline-danger">Dissocier</button></form>}
                {d.status !== "approved" && <form method="post" action={`/admin/devices/${d.code}/forget`}><button class="btn btn-sm btn-outline-secondary">Oublier</button></form>}
              </div>
            </div></div>
          );
        })}
        {devices.length === 0 && <div class="list-group-item text-secondary small">Aucun appareil. Ouvrez l'application sur l'Apple TV et scannez le QR code affiché.</div>}
      </div>
      <p class="text-secondary small">{fmt(devices.filter((d) => d.status === "approved").length)} appareil(s) appairé(s). Un appareil dissocié voit ses favoris et sa progression conservés : ils appartiennent au serveur, pas à l'appareil.</p>
    </>
  );
}
