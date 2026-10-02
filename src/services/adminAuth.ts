import bcrypt from "bcryptjs";
import config from "../config/index.js";

/*
 * ADMIN_PASSWORD is a plaintext env value, but comparing it with === would leak
 * the answer through response timing. Hash it once at first use and compare the
 * submitted value against the hash instead, which is constant-time.
 */
let adminHash: string | null = null;

async function getAdminHash(): Promise<string> {
  if (!adminHash) {
    adminHash = await bcrypt.hash(config.admin.password, 10);
  }
  return adminHash;
}

export interface AdminCredentials {
  email: string;
  password: string;
}

export async function verifyAdmin(
  credentials: AdminCredentials
): Promise<boolean> {
  const emailOk =
    typeof credentials.email === "string" &&
    credentials.email.trim().toLowerCase() === config.admin.email;
  const passwordOk =
    typeof credentials.password === "string" &&
    credentials.password.length > 0 &&
    (await bcrypt.compare(
      credentials.password,
      await getAdminHash()
    ));

  // run both checks regardless of the email result so timing stays flat
  return emailOk && passwordOk;
}
