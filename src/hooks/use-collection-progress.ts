"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface CollectionJobRow {
  id: string;
  site_id: string;
  search_url: string;
  status: string;
  total_target: number;
  total_collected: number;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function useCollectionProgress() {
  const [jobs, setJobs] = useState<CollectionJobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Initial fetch
    supabase
      .from("collection_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setJobs(data);
        setLoading(false);
      });

    // Realtime subscription
    const channel = supabase
      .channel("collection-progress")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "collection_jobs",
        },
        (payload: RealtimePostgresChangesPayload<CollectionJobRow>) => {
          if (payload.eventType === "INSERT") {
            setJobs((prev) => [payload.new as CollectionJobRow, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === (payload.new as CollectionJobRow).id
                  ? (payload.new as CollectionJobRow)
                  : j
              )
            );
          } else if (payload.eventType === "DELETE") {
            setJobs((prev) =>
              prev.filter((j) => j.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { jobs, loading };
}
