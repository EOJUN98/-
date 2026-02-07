"use server";

export async function pingAction() {
  return {
    ok: true,
    timestamp: new Date().toISOString()
  };
}
