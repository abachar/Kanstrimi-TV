import type { Device, DevicePush } from "@/db";
import type { PairingState } from "@/devices";
import type { NotificationRow } from "@/notify";
import { ago, fmt, hhmm } from "../format";
import { Badge, Card, CardIcon, Empty, Table, Title, type Tone } from "../ui";
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

/** The alerts, as the switches and the log name them. */
const KIND_LABELS: Record<string, string> = { waitlist: "Film attendu arrivé", runs: "Traitement complet", test: "Test" };
const SENT_STATUS: Record<string, [string, Tone]> = {
  sent: ["Envoyée", "ok"],
  failed: ["Échec", "warn"],
  unregistered: ["Jeton retiré", "muted"],
};

/** Under an approved device: its alert switches and the test button, or why it gets none yet. */
function PushRow({ device, push, apns }: { device: Device; push: DevicePush | undefined; apns: boolean }) {
  if (!push)
    return (
      <div class="col-span-2 flex items-center gap-2 text-sm text-muted-foreground md:col-span-12 md:pl-6">
        <Icon name="bell" cls="size-4 shrink-0" />
        Alertes : non enregistrées · ouvrir l'app sur l'iPhone et accepter les notifications
      </div>
    );
  return (
    <div class="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm md:col-span-12 md:pl-6">
      <Icon name="bell" cls="size-4 shrink-0 text-muted-foreground" />
      <form class="flex flex-wrap items-center gap-4" hx-post={`/admin/devices/${device.code}/push`} hx-trigger="change" hx-swap="none">
        {(["waitlist", "runs"] as const).map((kind) => (
          <label class="flex items-center gap-2">
            <input class="input" type="checkbox" role="switch" name={kind} checked={push[kind]} />
            {KIND_LABELS[kind]}
          </label>
        ))}
      </form>
      <span class="text-muted-foreground">
        jeton {push.environment === "sandbox" ? "bac à sable" : "production"} · {ago(push.updatedAt.toISOString())}
      </span>
      <form method="post" action={`/admin/devices/${device.code}/push/test`}>
        <button class="btn" data-variant="outline" data-size="sm" disabled={!apns} title={apns ? undefined : "APNs non configuré"}>
          <Icon name="test" />
          Envoyer un test
        </button>
      </form>
    </div>
  );
}

export function DevicesView({
  devices,
  push,
  apns,
  log,
}: {
  devices: Device[];
  push: Map<number, DevicePush>;
  apns: boolean;
  log: NotificationRow[];
}) {
  return (
    <>
      <Title t="Appareils" sub="Les Apple TV, iPhone, iPad et tablettes appairés à ce serveur, leurs jetons et leurs alertes" />
      <Card
        title="Appareils"
        icon="devices"
        hint={`${fmt(devices.filter((d) => d.status === "approved").length)} appareil(s) appairé(s). Un appareil dissocié voit ses favoris et sa progression conservés : ils appartiennent au serveur, pas à l'appareil.${apns ? "" : " APNs n'est pas configuré (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID) : les alertes restent au journal, en échec."}`}
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
                  {d.status === "approved" && <PushRow device={d} push={push.get(d.id)} apns={apns} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="Alertes envoyées" icon="bell" hint="Les dernières alertes poussées sur les iPhone, et ce qu'APNs en a dit.">
        {log.length === 0 ? (
          <Empty title="Aucune alerte" sub="Un film attendu qui arrive ou un traitement complet qui se termine en envoie une." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Quand</th>
                <th>Appareil</th>
                <th>Alerte</th>
                <th>Texte</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {log.map((n) => {
                const [label, tone] = SENT_STATUS[n.status] ?? [n.status, "plain"];
                return (
                  <tr>
                    <td class="whitespace-nowrap text-muted-foreground" title={n.sentAt.toISOString()}>
                      {ago(n.sentAt.toISOString())}
                    </td>
                    <td>{n.deviceName ?? "(appareil oublié)"}</td>
                    <td>{KIND_LABELS[n.kind] ?? n.kind}</td>
                    <td class="max-w-md">
                      <span class="font-medium">{n.title}</span> <span class="text-muted-foreground">{n.body}</span>
                    </td>
                    <td>
                      <Badge tone={tone} title={n.detail ?? undefined}>
                        {label}
                      </Badge>
                      {n.detail && n.status !== "sent" ? <span class="ml-1 text-xs text-muted-foreground">{n.detail}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
