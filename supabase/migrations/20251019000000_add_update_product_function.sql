-- Create a function to update products that bypasses the schema cache issue
CREATE OR REPLACE FUNCTION public.update_product(
  p_id UUID,
  p_name TEXT,
  p_price DECIMAL,
  p_pcs_price DECIMAL,
  p_box_price DECIMAL,
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
    description = p_description,
    status = p_status,
    updated_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;