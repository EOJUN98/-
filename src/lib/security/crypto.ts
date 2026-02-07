import "server-only";

import crypto from "crypto";

const ENCRYPTION_PREFIX = "enc:v1";

function getEncryptionKey() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) {
    throw new Error("ENCRYPTION_KEY 환경변수가 설정되지 않았습니다");
  }

  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("ENCRYPTION_KEY는 64자리 hex 문자열이어야 합니다");
  }

  return Buffer.from(value, "hex");
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

export function encryptSecret(value: string) {
  if (!value.trim()) {
    throw new Error("암호화할 값이 비어 있습니다");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("암호화된 키 형식이 올바르지 않습니다");
  }

  const iv = Buffer.from(parts[2], "hex");
  const authTag = Buffer.from(parts[3], "hex");
  const encrypted = Buffer.from(parts[4], "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function decryptSecretIfNeeded(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (!isEncryptedSecret(value)) {
    return value;
  }

  return decryptSecret(value);
}
