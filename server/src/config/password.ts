import bcrypt from "bcryptjs";
import { env } from "@/shared";

/** The single password, against `ADMIN_PASSWORD_HASH`: bcrypt every time, so every guess costs the same. */
export async function verifyPassword(password: string): Promise<boolean> {
  return Boolean(password) && (await bcrypt.compare(password, env.adminPasswordHash));
}
