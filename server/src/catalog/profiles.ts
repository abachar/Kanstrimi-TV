import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema, type Profile } from "@/db";

/**
 * The profiles: the persons of the household. Each one has its filters (`filters/`), judged at the
 * `filters` step, and what the app records is theirs. One is the default: the profile a device starts
 * on, the Top Shelf's, and the admin's when it looks through the app's eyes. It cannot be deleted.
 */

const p = schema.appProfiles;
/** Every column but the avatar: a list never carries the pictures, only a fingerprint of each (the image URL changes with it). */
const columns = {
  id: p.id,
  name: p.name,
  isDefault: p.isDefault,
  createdAt: p.createdAt,
  judgedAt: p.judgedAt,
  avatarVersion: sql<string>`left(md5(coalesce(${p.avatar}, ''::bytea)), 8)`,
};

/** All profiles, the default first, then by name. */
export async function listProfiles(): Promise<Profile[]> {
  return db.select(columns).from(p).orderBy(sql`${p.isDefault} desc`, asc(p.name), asc(p.id));
}

export async function profileById(id: number): Promise<Profile | null> {
  const [row] = await db.select(columns).from(p).where(eq(p.id, id));
  return row ?? null;
}

/** The default profile; the migration creates it and `deleteProfile` refuses it, so there is always one. */
export async function defaultProfile(): Promise<Profile> {
  const [row] = await db.select(columns).from(p).where(eq(p.isDefault, true));
  if (!row) throw new Error("Aucun profil par défaut");
  return row;
}

/** The avatar of a profile (a square WebP), or null when it has none. */
export async function profileAvatar(id: number): Promise<Buffer | null> {
  const [row] = await db.select({ avatar: p.avatar }).from(p).where(eq(p.id, id));
  return row?.avatar ?? null;
}

export class ProfileError extends Error {}

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
/** Another profile already spells this name, case aside (« sara » and « Sara » are one person). */
async function nameTaken(name: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: p.id })
    .from(p)
    .where(and(sql`lower(${p.name}) = lower(${name})`, exceptId === undefined ? undefined : sql`${p.id} <> ${exceptId}`));
  return Boolean(row);
}

/**
 * A new profile, its name unique (refused otherwise). It has no filter yet: it sees everything once
 * the `filters` step has judged it for the first time (its caller launches that).
 */
export async function createProfile(input: { name: string; avatar: Buffer | null }): Promise<Profile> {
  const name = cleanName(input.name);
  if (!name) throw new ProfileError("Le nom est obligatoire");
  if (await nameTaken(name)) throw new ProfileError(`Un profil s'appelle déjà « ${name} »`);
  const [row] = await db.insert(p).values({ name, avatar: input.avatar }).onConflictDoNothing({ target: p.name }).returning(columns);
  if (!row) throw new ProfileError(`Un profil s'appelle déjà « ${name} »`);
  return row;
}

/** Rename, and replace the avatar when one is given. */
export async function updateProfile(id: number, input: { name?: string; avatar?: Buffer }): Promise<Profile | null> {
  const set: Partial<typeof p.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) throw new ProfileError("Le nom est obligatoire");
    if (await nameTaken(name, id)) throw new ProfileError(`Un profil s'appelle déjà « ${name} »`);
    set.name = name;
  }
  if (input.avatar) set.avatar = input.avatar;
  if (!Object.keys(set).length) return profileById(id);
  try {
    const [row] = await db.update(p).set(set).where(eq(p.id, id)).returning(columns);
    return row ?? null;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ProfileError(`Un profil s'appelle déjà « ${set.name} »`);
    throw e;
  }
}

/** The default moves to `id`: one statement, the partial unique index allows a single default. */
export async function setDefaultProfile(id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: p.id }).from(p).where(eq(p.id, id));
    if (!target) return false;
    await tx.update(p).set({ isDefault: false }).where(eq(p.isDefault, true));
    await tx.update(p).set({ isDefault: true }).where(eq(p.id, id));
    return true;
  });
}

/** The `filters` step judged every version for this profile: it sees what its filters keep. */
export async function markProfileJudged(id: number) {
  await db.update(p).set({ judgedAt: new Date() }).where(eq(p.id, id));
}

/** Everything the profile recorded goes with it (cascade). The default profile is refused. */
export async function deleteProfile(id: number): Promise<"deleted" | "default" | "unknown"> {
  const [row] = await db.select(columns).from(p).where(eq(p.id, id));
  if (!row) return "unknown";
  if (row.isDefault) return "default";
  await db.delete(p).where(eq(p.id, id));
  return "deleted";
}
