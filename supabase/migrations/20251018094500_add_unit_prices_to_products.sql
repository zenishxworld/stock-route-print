-- Add per-unit pricing columns to products and seed default values
BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pcs_price numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS box_price numeric;

-- Fresh beverages: pcs = 10, box = 170
UPDATE public.products
SET pcs_price = 10, box_price = 170
WHERE lower(name) IN (
  'fresh instant energy 200 ml',
  'fresh jeera 200 ml',
  'fresh pepyo 200 ml',
  'fresh club soda 300ml',
  'fresh jeera 250 ml',
  'fresh mojito 200 ml',
  'fresh lahori 200 ml',
  'fresh blueberry soda 200ml',
  'fresh mango 200ml',
  'fresh cola 200 ml',
  'fresh clear lemon 200ml'
);

-- 1 liter water variants: pcs = 20, box = 80
UPDATE public.products
SET pcs_price = 20, box_price = 80
WHERE lower(name) IN (
  '1 liter water',
  '1 litter water',
  '1 little water mrp 20'
);

-- 500ml/50ml water variants: pcs = 10, box = 100
UPDATE public.products
SET pcs_price = 10, box_price = 100
WHERE lower(name) IN (
  '500 ml water mrp 10',
  '50 ml water',
  '50ml water'
);

COMMIT;