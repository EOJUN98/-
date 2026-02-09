-- Add a human-friendly label for collection jobs (search filter / group name).

ALTER TABLE public.collection_jobs
  ADD COLUMN IF NOT EXISTS display_name TEXT;

