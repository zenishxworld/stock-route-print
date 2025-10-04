-- Update existing routes to use Route 1, Route 2, Route 3 format
UPDATE public.routes SET name = 'Route 1' WHERE name = 'Rajkot - Jamnagar';
UPDATE public.routes SET name = 'Route 2' WHERE name = 'Ahmedabad - Vadodara';
UPDATE public.routes SET name = 'Route 3' WHERE name = 'Gandhinagar - Mehsana';

-- Delete the Surat - Navsari route as it's not mentioned in requirements
DELETE FROM public.routes WHERE name = 'Surat - Navsari';

-- Ensure we have the correct routes with proper ordering
-- This will handle any existing data and ensure consistency
DO $$
DECLARE
    route_count INTEGER;
BEGIN
    -- Get count of existing routes
    SELECT COUNT(*) INTO route_count FROM public.routes WHERE is_active = true;
    
    -- If no routes exist, insert the default ones
    IF route_count = 0 THEN
        INSERT INTO public.routes (name, description, is_active) VALUES
        ('Route 1', 'Main route covering Rajkot to Jamnagar', true),
        ('Route 2', 'Highway route from Ahmedabad to Vadodara', true),
        ('Route 3', 'North Gujarat route', true);
    END IF;
END $$;
