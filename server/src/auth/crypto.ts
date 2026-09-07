import crypto from "node:crypto";

const SALT = "fitbit-ai-dashboard";

export function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, SALT, 32);
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(payload: string, secret: string): string {
  const key = deriveKey(secret);
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 29) throw new Error("invalid encrypted payload");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
