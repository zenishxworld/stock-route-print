import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Route, Truck, Package, Plus, Minus } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
}

interface RouteOption {
  id: string;
  name: string;
}

interface TruckOption {
  id: string;
  name: string;
}

interface StockItem {
  productId: string;
  quantity: number;
}

const StartRoute = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedTruck, setSelectedTruck] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch products, routes, and trucks
      const [productsRes, routesRes, trucksRes] = await Promise.all([
        supabase.from("products").select("*").eq("status", "active"),
        supabase.from("routes").select("*").eq("is_active", true),
        supabase.from("trucks").select("*").eq("is_active", true),
      ]);

      if (productsRes.data) {
        setProducts(productsRes.data);
        // Initialize stock with all products at 0 quantity
        setStock(productsRes.data.map(product => ({ productId: product.id, quantity: 0 })));
      }
      
      if (routesRes.data) setRoutes(routesRes.data);
      if (trucksRes.data) setTrucks(trucksRes.data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    }
  };

  const updateStock = (productId: string, change: number) => {
    setStock(prev => 
      prev.map(item => 
        item.productId === productId 
          ? { ...item, quantity: Math.max(0, item.quantity + change) }
          : item
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "Please login first",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      // Filter out products with 0 quantity
      const nonZeroStock = stock.filter(item => item.quantity > 0);

      if (nonZeroStock.length === 0) {
        toast({
          title: "Error",
          description: "Please add at least one product to your stock",
          variant: "destructive",
        });
        return;
      }

      // Save daily stock to database using any type to handle schema mismatch
      const stockData: any = {
        auth_user_id: user.id,
        truck_id: selectedTruck,
        route_id: selectedRoute,
        date: new Date().toISOString().split('T')[0],
        stock: nonZeroStock,
      };

      const { error } = await supabase.from("daily_stock").upsert(stockData);

      if (error) {
        throw error;
      }

      toast({
        title: "Route Started!",
        description: "Your daily stock has been recorded successfully",
      });
      
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start route",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalProducts = stock.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-primary-light/10">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-business-blue to-business-blue-dark rounded-xl flex items-center justify-center">
                <Route className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Start Route</h1>
                <p className="text-sm text-muted-foreground">Setup your daily inventory</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="border-0 shadow-strong">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-bold">Route Configuration</CardTitle>
            <CardDescription className="text-base">
              Select your truck, route, and set initial stock levels
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Route and Truck Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    Select Route
                  </Label>
                  <Select value={selectedRoute} onValueChange={setSelectedRoute} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose your route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Select Truck
                  </Label>
                  <Select value={selectedTruck} onValueChange={setSelectedTruck} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose your truck" />
                    </SelectTrigger>
                    <SelectContent>
                      {trucks.map((truck) => (
                        <SelectItem key={truck.id} value={truck.id}>
                          {truck.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stock Configuration */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-semibold flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Initial Stock
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-primary">{totalProducts}</span> items
                  </div>
                </div>

                <div className="grid gap-4">
                  {products.map((product) => {
                    const stockItem = stock.find(s => s.productId === product.id);
                    const quantity = stockItem?.quantity || 0;
                    
                    return (
                      <Card key={product.id} className="border border-border hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-foreground">{product.name}</h4>
                              <p className="text-sm text-muted-foreground">₹{product.price.toFixed(2)} per unit</p>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => updateStock(product.id, -1)}
                                disabled={quantity === 0}
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                              
                              <Input
                                type="number"
                                value={quantity}
                                onChange={(e) => {
                                  const newQuantity = Math.max(0, parseInt(e.target.value) || 0);
                                  setStock(prev => 
                                    prev.map(item => 
                                      item.productId === product.id 
                                        ? { ...item, quantity: newQuantity }
                                        : item
                                    )
                                  );
                                }}
                                className="w-20 text-center"
                                min="0"
                              />
                              
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => updateStock(product.id, 1)}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Button
                type="submit"
                variant="success"
                size="lg"
                className="w-full"
                disabled={loading || !selectedRoute || !selectedTruck || totalProducts === 0}
              >
                {loading ? "Starting Route..." : "Start Route"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default StartRoute;