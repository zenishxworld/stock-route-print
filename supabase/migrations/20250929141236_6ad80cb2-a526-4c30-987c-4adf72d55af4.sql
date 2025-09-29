-- Create users table for authentication
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'driver' CHECK (role IN ('driver', 'admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL CHECK (price > 0),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create routes table
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trucks table
CREATE TABLE public.trucks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  license_plate TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create daily_stock table for tracking starting inventory
CREATE TABLE public.daily_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  truck_id UUID NOT NULL REFERENCES public.trucks(id),
  route_id UUID NOT NULL REFERENCES public.routes(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  stock JSONB NOT NULL DEFAULT '[]', -- Array of {product_id, quantity}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, truck_id, route_id, date)
);

-- Create sales table for recording shop transactions
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  truck_id UUID NOT NULL REFERENCES public.trucks(id),
  route_id UUID NOT NULL REFERENCES public.routes(id),
  shop_name TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  products_sold JSONB NOT NULL DEFAULT '[]', -- Array of {product_id, quantity, price}
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create policies for users table (users can only see their own data)
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Create policies for products table (readable by all authenticated users)
CREATE POLICY "Products are viewable by authenticated users" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins can manage products" ON public.products FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Create policies for routes table (readable by all authenticated users)
CREATE POLICY "Routes are viewable by authenticated users" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins can manage routes" ON public.routes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Create policies for trucks table (readable by all authenticated users)
CREATE POLICY "Trucks are viewable by authenticated users" ON public.trucks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins can manage trucks" ON public.trucks FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Create policies for daily_stock table (users can only see their own stock)
CREATE POLICY "Users can view their own daily stock" ON public.daily_stock FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own daily stock" ON public.daily_stock FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own daily stock" ON public.daily_stock FOR UPDATE USING (auth.uid() = user_id);

-- Create policies for sales table (users can only see their own sales)
CREATE POLICY "Users can view their own sales" ON public.sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own sales" ON public.sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sales" ON public.sales FOR UPDATE USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_daily_stock_updated_at BEFORE UPDATE ON public.daily_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample data
INSERT INTO public.products (name, price, description) VALUES
  ('Coca Cola 250ml', 15.00, 'Classic Coca Cola 250ml bottle'),
  ('Pepsi 250ml', 15.00, 'Pepsi 250ml bottle'),
  ('Sprite 250ml', 15.00, 'Sprite lemon-lime 250ml bottle'),
  ('Fanta Orange 250ml', 15.00, 'Fanta Orange 250ml bottle'),
  ('Thumbs Up 250ml', 15.00, 'Thumbs Up 250ml bottle'),
  ('Limca 250ml', 15.00, 'Limca 250ml bottle');

INSERT INTO public.routes (name, description) VALUES
  ('Rajkot - Jamnagar', 'Main route covering Rajkot to Jamnagar'),
  ('Ahmedabad - Vadodara', 'Highway route from Ahmedabad to Vadodara'),
  ('Surat - Navsari', 'South Gujarat route'),
  ('Gandhinagar - Mehsana', 'North Gujarat route');

INSERT INTO public.trucks (name, license_plate) VALUES
  ('Truck-001', 'GJ-01-AB-1234'),
  ('Truck-002', 'GJ-02-CD-5678'),
  ('Truck-003', 'GJ-03-EF-9012');