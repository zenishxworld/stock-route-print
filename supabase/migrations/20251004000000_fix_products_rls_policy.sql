-- Fix products RLS policy to allow all authenticated users to manage products
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Only admins can manage products" ON public.products;

-- Create new policies that allow all authenticated users to manage products
CREATE POLICY "Authenticated users can insert products" ON public.products 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products" ON public.products 
  FOR UPDATE TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can delete products" ON public.products 
  FOR DELETE TO authenticated 
  USING (true);
