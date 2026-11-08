import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  AccountError,
  accountById,
  createAccount,
  deleteAccount,
  listAccounts,
  moveAccount,
  setAccountEnabled,
  updateAccount,
} from "@/config";
import { launch, variantCountsByAccount } from "@/catalog";
import { testXtream } from "@/providers/xtream";
import { describeError } from "@/shared";
import { page, back, zerr, intParam, checked } from "../http";
import { InlineResult } from "../ui";
import { ProvidersView } from "./view";

/**
 * `/admin/providers`: the Xtream accounts, one per provider, in the order of preference. Enabling,
 * disabling or deleting one changes what the app sees: the grouping is relaunched (`group` → `filters`)
 * so the aggregates and what each profile sees follow.
 */
export const providersRoutes = new Hono();

const accountSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(40),
  url: z.string().trim().min(1, "L'URL est obligatoire"),
  username: z.string().trim().min(1, "L'utilisateur est obligatoire"),
  password: z.string().min(1, "Le mot de passe est obligatoire"),
});

const HOME = "/admin/providers";
const regroup = () =>
  launch("pipeline", "group") ? " · regroupement lancé" : " · traitement déjà en cours, relancer à partir de « group »";

const withErrors = async (c: Parameters<typeof back>[0], ok: string, fn: () => Promise<void>) => {
  try {
    await fn();
    return back(c, HOME, { ok });
  } catch (e) {
    if (e instanceof AccountError) return back(c, HOME, { err: e.message });
    throw e;
  }
};

providersRoutes.get("/", async (c) => {
  const [accounts, counts] = await Promise.all([listAccounts(), variantCountsByAccount()]);
  const lines = accounts.map((account) => ({ account, counts: counts.get(account.id) ?? { live: 0, vod: 0, series: 0 } }));
  return page(c, "Fournisseurs", <ProvidersView lines={lines} />);
});

providersRoutes.post(
  "/",
  zValidator("form", accountSchema, (r, c) => {
    if (!r.success) return back(c, HOME, { err: zerr(r.error) });
  }),
  (c) =>
    withErrors(c, "Fournisseur ajouté — lancer le traitement complet pour importer son catalogue", () =>
      createAccount(c.req.valid("form")).then(() => {}),
    ),
);
providersRoutes.post(
  "/:id",
  zValidator("form", accountSchema, (r, c) => {
    if (!r.success) return back(c, HOME, { err: zerr(r.error) });
  }),
  (c) => withErrors(c, "Fournisseur enregistré", () => updateAccount(intParam(c, "id"), c.req.valid("form"))),
);
providersRoutes.post("/:id/enabled", async (c) => {
  const id = intParam(c, "id");
  const enabled = await checked(c, "enabled");
  await setAccountEnabled(id, enabled);
  return back(c, HOME, {
    ok: `${enabled ? "Fournisseur activé" : "Fournisseur désactivé : son catalogue reste en base, plus servi"}${regroup()}`,
  });
});
providersRoutes.post("/:id/up", async (c) => {
  await moveAccount(intParam(c, "id"), "up");
  return back(c, HOME, {});
});
providersRoutes.post("/:id/down", async (c) => {
  await moveAccount(intParam(c, "id"), "down");
  return back(c, HOME, {});
});
providersRoutes.post("/:id/delete", async (c) => {
  await deleteAccount(intParam(c, "id"));
  return back(c, HOME, { ok: `Fournisseur supprimé avec tout ce qu'il avait apporté${regroup()}` });
});
/** The connection test of a saved account, inline (htmx). */
providersRoutes.post("/:id/test", async (c) => {
  const a = await accountById(intParam(c, "id"));
  if (!a) return c.html(<InlineResult ok={false} text="Fournisseur inconnu" />);
  try {
    const ui = (await testXtream(a.url, a.username, a.password)).user_info;
    if (Number(ui.auth) !== 1) return c.html(<InlineResult ok={false} text={`Refusé : ${ui.message ?? ui.status}`} />);
    const exp = ui.exp_date ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString("fr-FR") : "∞";
    return c.html(<InlineResult ok text={`OK — statut ${ui.status}, expire ${exp}, connexions max ${ui.max_connections ?? "?"}`} />);
  } catch (e) {
    return c.html(<InlineResult ok={false} text={describeError(e)} />);
  }
});
