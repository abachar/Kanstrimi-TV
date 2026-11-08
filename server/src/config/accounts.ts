import { asc, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema, type ProviderAccount } from "@/db";
import { env } from "@/shared";

/**
 * The provider accounts (`provider_accounts`), edited in Fournisseurs: one Xtream account per
 * provider, in the order of preference the admin gives them (the first provider's source is the one
 * that plays by default). Stored in clear: the apps receive the same credentials in every stream URL.
 * One process, one reader: cached in memory, dropped on every write.
 */

let cache: ProviderAccount[] | null = null;
export function invalidateAccounts() {
  cache = null;
}

/** Every account, preferred first. */
export async function listAccounts(): Promise<ProviderAccount[]> {
  if (!cache)
    cache = await db.select().from(schema.providerAccounts).orderBy(asc(schema.providerAccounts.position), asc(schema.providerAccounts.id));
  return [...cache];
}
/** The enabled accounts, preferred first: what the pipeline imports and the apps play. */
export const activeAccounts = async () => (await listAccounts()).filter((a) => a.enabled && isAccountComplete(a));
export const hasActiveAccounts = async () => (await activeAccounts()).length > 0;
export const accountById = async (id: number) => (await listAccounts()).find((a) => a.id === id) ?? null;
/** The accounts by id, for a request that turns many variants into stream URLs. */
export async function accountsById(): Promise<Map<number, ProviderAccount>> {
  return new Map((await listAccounts()).map((a) => [a.id, a]));
}

/** An account the import can use: URL, user and password all set (the one the migration created waits for them). */
export const isAccountComplete = (a: Pick<ProviderAccount, "url" | "username" | "password">) => Boolean(a.url && a.username && a.password);

export type AccountInput = { name: string; url: string; username: string; password: string };

export class AccountError extends Error {}

function check(input: AccountInput) {
  if (!input.name.trim()) throw new AccountError("Le nom est obligatoire");
  if (!/^(https?:\/\/)?[^\s/]+(\/.*)?$/i.test(input.url.trim())) throw new AccountError("L'URL du fournisseur est invalide");
  if (!input.username.trim() || !input.password) throw new AccountError("Utilisateur et mot de passe sont obligatoires");
}
const clean = (input: AccountInput): AccountInput => ({
  name: input.name.trim(),
  url: input.url.trim().replace(/\/+$/, ""),
  username: input.username.trim(),
  password: input.password,
});

/** Adds an account at the end of the list (the least preferred). */
export async function createAccount(input: AccountInput): Promise<ProviderAccount> {
  check(input);
  const [{ last }] = await db
    .select({ last: sql<number>`coalesce(max(${schema.providerAccounts.position}), 0)::int` })
    .from(schema.providerAccounts);
  const [row] = await db
    .insert(schema.providerAccounts)
    .values({ ...clean(input), position: last + 1 })
    .returning();
  invalidateAccounts();
  return row;
}

export async function updateAccount(id: number, input: AccountInput): Promise<void> {
  check(input);
  await db
    .update(schema.providerAccounts)
    .set({ ...clean(input), updatedAt: new Date() })
    .where(eq(schema.providerAccounts.id, id));
  invalidateAccounts();
}

/** Disabled: its catalogue stays in base but is served no more, until it is enabled again. */
export async function setAccountEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(schema.providerAccounts).set({ enabled, updatedAt: new Date() }).where(eq(schema.providerAccounts.id, id));
  invalidateAccounts();
}

/** Deleted: every row it brought goes with it (cascade); the contents left without a variant go at the next grouping. */
export async function deleteAccount(id: number): Promise<void> {
  await db.delete(schema.providerAccounts).where(eq(schema.providerAccounts.id, id));
  invalidateAccounts();
}

/** Swaps the account with its neighbour: up = more preferred. */
export async function moveAccount(id: number, dir: "up" | "down"): Promise<void> {
  const t = schema.providerAccounts;
  const [me] = await db.select().from(t).where(eq(t.id, id));
  if (!me) return;
  const [other] = await db
    .select()
    .from(t)
    .where(dir === "up" ? lt(t.position, me.position) : gt(t.position, me.position))
    .orderBy(dir === "up" ? sql`${t.position} desc` : asc(t.position))
    .limit(1);
  if (!other) return;
  await db.transaction(async (tx) => {
    await tx.update(t).set({ position: other.position }).where(eq(t.id, me.id));
    await tx.update(t).set({ position: me.position }).where(eq(t.id, other.id));
  });
  invalidateAccounts();
}

/**
 * At boot: the account of the environment (`XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD`, the
 * podman secrets of before) fills the account the migration left empty, or becomes the first one
 * when there is none. Nothing happens when every account is complete: the environment can then go.
 * Returns what it did, for the boot log.
 */
export async function seedAccountFromEnv(): Promise<"filled" | "created" | "nothing"> {
  const { xtream_url: url, xtream_username: username, xtream_password: password } = env.secrets;
  if (!url || !username || !password) return "nothing";
  const accounts = await listAccounts();
  let name = "Fournisseur";
  try {
    name = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).hostname;
  } catch {
    /* keep default */
  }
  const empty = accounts.find((a) => !isAccountComplete(a));
  if (empty) {
    await db
      .update(schema.providerAccounts)
      .set({ name: empty.name === "Fournisseur" ? name : empty.name, url, username, password, updatedAt: new Date() })
      .where(eq(schema.providerAccounts.id, empty.id));
    invalidateAccounts();
    return "filled";
  }
  if (accounts.length) return "nothing";
  await createAccount({ name, url, username, password });
  return "created";
}
