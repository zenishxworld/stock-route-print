-- Fix routes and trucks RLS policies to allow all authenticated users to manage them
-- Drop the existing restrictive policies for routes
DROP POLICY IF EXISTS "Only admins can manage routes" ON public.routes;

-- Create new policies that allow all authenticated users to manage routes
CREATE POLICY "Authenticated users can insert routes" ON public.routes 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update routes" ON public.routes 
  FOR UPDATE TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can delete routes" ON public.routes 
  FOR DELETE TO authenticated 
  USING (true);

-- Drop the existing restrictive policies for trucks
DROP POLICY IF EXISTS "Only admins can manage trucks" ON public.trucks;

-- Create new policies that allow all authenticated users to manage trucks
CREATE POLICY "Authenticated users can insert trucks" ON public.trucks 
  FOR INSERT TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update trucks" ON public.trucks 
  FOR UPDATE TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can delete trucks" ON public.trucks 
  FOR DELETE TO authenticated 
  USING (true);
