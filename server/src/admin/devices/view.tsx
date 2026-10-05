import type { Device } from "@/db";
import type { PairingState } from "@/devices";
import { ago, fmt, hhmm } from "../format";
import { Badge, Card, CardIcon, Empty, Title, type Tone } from "../ui";
import { Icon } from "../icons";

/** `/admin/pair/{code}`, opened from the QR code on the TV: name it, confirm. */
export type PairRequest = { at: Date; ip: string | null; sameAsYou: boolean };

export function PairView({ code, state, request, error }: { code: string; state: PairingState; request?: PairRequest; error?: string }) {
  const display = `${code.slice(0, 3)}-${code.slice(3)}`;
  return (
    <section class="card mx-auto w-full max-w-md">
      <header>
        <h2 class="flex items-center gap-2">
          <CardIcon name="devices" />
          Ajouter cet appareil ?
        </h2>
        <p>
          Code affiché sur l'appareil : <span class="font-mono text-2xl text-foreground">{display}</span>
        </p>
      </header>
      <section class="flex flex-col gap-4">
        {error && (
          <div class="alert" data-variant="destructive" role="alert">
            <Icon name="error" />
            <h2>{error}</h2>
          </div>
        )}
        {state === "pending" && request && (
          <p class="text-sm text-muted-foreground">
            Demandé à <span class="text-foreground">{hhmm(request.at)}</span> ({ago(request.at.toISOString())}) depuis{" "}
            <span class="font-mono text-foreground">{request.ip ?? "adresse inconnue"}</span>
            {request.sameAsYou
              ? ", la même adresse que vous."
              : ". Une autre adresse que la vôtre : normal si l'appareil passe par un VPN ou un autre réseau, sinon vérifiez que ce code est bien sur votre écran."}
          </p>
        )}
        {state === "pending" && (
          <form method="post" action={`/admin/pair/${code}`} class="flex flex-col gap-4">
            <div class="field">
              <label class="label" for="device-name">
                Nom de l'appareil
              </label>
              <input class="input" id="device-name" name="name" value="Salon" maxlength={40} required autofocus />
            </div>
            <button class="btn" data-variant="primary">
              <Icon name="check" />
              Confirmer
            </button>
          </form>
        )}
        {state === "done" && (
          <div class="alert" role="status">
            <Icon name="success" />
            <h2>C'est fait : l'appareil se connecte de lui-même dans les secondes qui viennent.</h2>
          </div>
        )}
        {state === "expired" && (
          <div class="alert" role="alert">
            <Icon name="alert" />
            <h2>Ce code a expiré. L'appareil en affiche un nouveau tout seul : recommencez depuis celui-ci.</h2>
          </div>
        )}
        {state === "unknown" && (
          <div class="alert" role="alert">
            <Icon name="alert" />
            <h2>Code inconnu. Vérifiez le code affiché sur l'appareil.</h2>
          </div>
        )}
        <p class="text-sm">
          <a href="/admin/devices" class="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Tous les appareils
          </a>
        </p>
      </section>
    </section>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  pending: ["En attente", "plain"],
  approved: ["Appairé", "ok"],
  revoked: ["Dissocié", "bad"],
};

export function DevicesView({ devices }: { devices: Device[] }) {
  return (
    <>
      <Title t="Appareils" sub="Les Apple TV et iPhone appairés à ce serveur et leurs jetons" />
      <Card
        title="Appareils"
        icon="devices"
        hint={`${fmt(devices.filter((d) => d.status === "approved").length)} appareil(s) appairé(s). Un appareil dissocié voit ses favoris et sa progression conservés : ils appartiennent au serveur, pas à l'appareil.`}
      >
        {devices.length === 0 ? (
          <Empty title="Aucun appareil" sub="Ouvrez l'application sur l'Apple TV (QR code) ou l'iPhone (lien vers l'admin)." />
        ) : (
          <ul class="flex flex-col divide-y">
            {devices.map((d) => {
              const [label, tone] = STATUS[d.status] ?? [d.status, "plain"];
              const expired = d.status === "pending" && d.expiresAt.getTime() < Date.now();
              return (
                <li class="grid grid-cols-2 items-center gap-2 py-3 md:grid-cols-12">
                  <div class="col-span-2 flex min-w-0 items-center gap-2 md:col-span-4">
                    <Icon name="devices" cls="size-4 shrink-0 text-muted-foreground" />
                    <span class="truncate font-medium">{d.name ?? "(sans nom)"}</span>
                    <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{d.code}</code>
                  </div>
                  <div class="md:col-span-2">
                    <Badge tone={expired ? "muted" : tone}>{expired ? "Expiré" : label}</Badge>
                  </div>
                  <div class="text-sm text-muted-foreground md:col-span-3">
                    {d.status === "approved" ? (
                      <>
                        vu {ago(d.lastSeenAt?.toISOString())}
                        {d.lastIp ? ` · ${d.lastIp}` : ""}
                      </>
                    ) : d.status === "pending" ? (
                      <>créé {ago(d.createdAt.toISOString())}</>
                    ) : (
                      <>appairé {ago(d.approvedAt?.toISOString())}</>
                    )}
                  </div>
                  <div class="col-span-2 flex gap-2 md:col-span-3 md:justify-end">
                    {d.status === "pending" && !expired && (
                      <a class="btn" data-variant="primary" data-size="sm" href={`/admin/pair/${d.code}`}>
                        <Icon name="check" />
                        Approuver
                      </a>
                    )}
                    {d.status === "approved" && (
                      <form
                        method="post"
                        action={`/admin/devices/${d.code}/revoke`}
                        hx-post={`/admin/devices/${d.code}/revoke`}
                        hx-confirm="Dissocier cet appareil ? Il devra être appairé à nouveau."
                      >
                        <button class="btn" data-variant="destructive" data-size="sm">
                          <Icon name="unlink" />
                          Dissocier
                        </button>
                      </form>
                    )}
                    {d.status !== "approved" && (
                      <form method="post" action={`/admin/devices/${d.code}/forget`}>
                        <button class="btn" data-variant="outline" data-size="sm">
                          <Icon name="trash" />
                          Oublier
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
