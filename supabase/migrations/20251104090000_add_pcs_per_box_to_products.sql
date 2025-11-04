BEGIN;

-- Add configurable pieces-per-box to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pcs_per_box integer NOT NULL DEFAULT 24;

-- Ensure existing rows have a sane default
UPDATE public.products SET pcs_per_box = 24 WHERE pcs_per_box IS NULL;

COMMIT;