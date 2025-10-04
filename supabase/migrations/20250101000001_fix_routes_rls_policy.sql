-- Fix RLS policy to allow all authenticated users to create and manage routes
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Only admins can manage routes" ON public.routes;

-- Create new policies that allow all authenticated users to manage routes
CREATE POLICY "Authenticated users can view routes" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create routes" ON public.routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update routes" ON public.routes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete routes" ON public.routes FOR DELETE TO authenticated USING (true);
