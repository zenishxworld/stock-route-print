-- Fix the migration by dropping policies first, then constraints
DROP POLICY IF EXISTS "Users can view their own daily stock" ON public.daily_stock;
DROP POLICY IF EXISTS "Users can create their own daily stock" ON public.daily_stock;
DROP POLICY IF EXISTS "Users can update their own daily stock" ON public.daily_stock;

DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can create their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can update their own sales" ON public.sales;

-- Now we can safely drop the foreign key constraints and columns
ALTER TABLE public.daily_stock DROP CONSTRAINT IF EXISTS daily_stock_user_id_fkey CASCADE;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_user_id_fkey CASCADE;

-- Drop the unique constraint that depends on user_id
ALTER TABLE public.daily_stock DROP CONSTRAINT IF EXISTS daily_stock_user_id_truck_id_route_id_date_key;

-- Now drop the columns
ALTER TABLE public.daily_stock DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.sales DROP COLUMN IF EXISTS user_id;

-- Add the new auth_user_id columns
ALTER TABLE public.daily_stock ADD COLUMN auth_user_id UUID NOT NULL REFERENCES auth.users(id);
ALTER TABLE public.sales ADD COLUMN auth_user_id UUID NOT NULL REFERENCES auth.users(id);

-- Add back the unique constraint with new column
ALTER TABLE public.daily_stock ADD CONSTRAINT daily_stock_auth_user_id_truck_id_route_id_date_key UNIQUE(auth_user_id, truck_id, route_id, date);

-- Create new RLS policies
CREATE POLICY "Users can view their own daily stock" ON public.daily_stock FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can create their own daily stock" ON public.daily_stock FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "Users can update their own daily stock" ON public.daily_stock FOR UPDATE USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can view their own sales" ON public.sales FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can create their own sales" ON public.sales FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "Users can update their own sales" ON public.sales FOR UPDATE USING (auth.uid() = auth_user_id);