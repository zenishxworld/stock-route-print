BEGIN;

-- Update update_product function to support pcs_per_box
CREATE OR REPLACE FUNCTION public.update_product(
  p_id UUID,
  p_name TEXT,
  p_price DECIMAL,
  p_pcs_price DECIMAL,
  p_box_price DECIMAL,
  p_pcs_per_box INTEGER,
  p_description TEXT,
  p_status TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE public.products
  SET 
    name = p_name,
    price = p_price,
    pcs_price = p_pcs_price,
    box_price = p_box_price,
    pcs_per_box = COALESCE(p_pcs_per_box, pcs_per_box),
    description = p_description,
    status = p_status,
    updated_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure API roles can call the function
GRANT EXECUTE ON FUNCTION public.update_product(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT
) TO anon, authenticated;

COMMIT;