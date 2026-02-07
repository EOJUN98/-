import { createBrowserClient } from "@supabase/ssr";

function readPublicSupabaseEnv() {
  // Next.js only inlines env values for static property access (not bracket notation).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!anonKey) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return {
    url,
    anonKey
  };
}

export function createSupabaseBrowserClient() {
  const { url, anonKey } = readPublicSupabaseEnv();
  return createBrowserClient(
    url,
    anonKey
  );
}
