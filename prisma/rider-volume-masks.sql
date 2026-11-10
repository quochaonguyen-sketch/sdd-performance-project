-- Rider Volume Masks table for Super Admin overrides
CREATE TABLE IF NOT EXISTS public.rider_volume_masks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_code TEXT NOT NULL UNIQUE,
  rider_name TEXT,
  factor NUMERIC(5, 2) NOT NULL DEFAULT 0.50 CHECK (factor >= 0.00 AND factor <= 5.00),
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'delivery', 'pickup')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_volume_masks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_volume_masks FROM public, anon, authenticated;
GRANT ALL PRIVILEGES ON public.rider_volume_masks TO service_role;
