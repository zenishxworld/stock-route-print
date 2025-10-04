import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { mapRouteName, shouldDisplayRoute } from "@/lib/routeUtils";
import { ArrowLeft, Route, Package, Plus, Minus, Trash2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
}

interface RouteOption {
  id: string;
  name: string;
  displayName?: string;
}


interface StockItem {
  productId: string;
  quantity: number;
}

const StartRoute = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [selectedRoute, setSelectedRoute] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewRouteDialog, setShowNewRouteDialog] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (!session) {
        navigate('/auth');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (selectedRoute) {
      checkExistingStock();
    }
  }, [selectedRoute]);

  const fetchData = async () => {
    try {
      // Fetch products and routes
      const [productsRes, routesRes] = await Promise.all([
        supabase.from("products").select("*").eq("status", "active"),
        supabase.from("routes").select("*").eq("is_active", true),
      ]);

      if (productsRes.data) {
        setProducts(productsRes.data);
        // Initialize stock with all products at 0 quantity
        setStock(productsRes.data.map(product => ({ productId: product.id, quantity: 0 })));
      }
      
      if (routesRes.data) {
        // Map old route names to new Route 1, 2, 3 format and filter out hidden routes
        const mappedRoutes = routesRes.data
          .filter(route => shouldDisplayRoute(route.name))
          .map(route => ({
            ...route,
            displayName: mapRouteName(route.name)
          }));
        
        setRoutes(mappedRoutes);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    }
  };

  const checkExistingStock = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from("daily_stock")
        .select("*")
        .eq("route_id", selectedRoute)
        .eq("date", today)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        // Stock already exists for today
        toast({
          title: "Stock Already Set",
          description: "Initial stock for this route has already been set today. Loading existing stock...",
        });
        
        // Load existing stock
        if (data.stock && Array.isArray(data.stock)) {
          setStock(prev => 
            prev.map(item => {
              const existingItem = (data.stock as any[]).find(
                (s: any) => s.productId === item.productId
              );
              return existingItem ? { ...item, quantity: existingItem.quantity } : item;
            })
          );
        }
      }
    } catch (error: any) {
      console.error("Error checking existing stock:", error);
    }
  };

  const updateStock = (productId: string, change: number) => {
    setStock(prev => 
      prev.map(item => 
        item.productId === productId 
          ? { ...item, quantity: Math.max(0, item.quantity + (change * 5)) }
          : item
      )
    );
  };

  const createNewRoute = async () => {
    if (!newRouteName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a route name",
        variant: "destructive",
      });
      return;
    }

    setCreatingRoute(true);
    try {
      const { data, error } = await supabase
        .from("routes")
        .insert({
          name: newRouteName.trim(),
          description: `Custom route: ${newRouteName.trim()}`,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      // Add the new route to the local state
      setRoutes(prev => [...prev, { id: data.id, name: data.name, displayName: data.name }]);
      
      // Select the newly created route
      setSelectedRoute(data.id);
      
      // Close dialog and reset form
      setShowNewRouteDialog(false);
      setNewRouteName("");
      
      toast({
        title: "Success!",
        description: `Route "${data.name}" created successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create route",
        variant: "destructive",
      });
    } finally {
      setCreatingRoute(false);
    }
  };

  const deleteRoute = async (routeId: string) => {
    setDeletingRoute(true);
    try {
      const { error } = await supabase
        .from("routes")
        .delete()
        .eq("id", routeId);

      if (error) throw error;

      // Remove the route from local state
      setRoutes(prev => prev.filter(route => route.id !== routeId));
      
      // If the deleted route was selected, clear selection
      if (selectedRoute === routeId) {
        setSelectedRoute("");
      }
      
      toast({
        title: "Success!",
        description: "Route deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete route",
        variant: "destructive",
      });
    } finally {
      setDeletingRoute(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to continue",
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    setLoading(true);

    try {
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

      const today = new Date().toISOString().split('T')[0];

      // Check if stock already exists for today
      const { data: existingStock } = await supabase
        .from("daily_stock")
        .select("id")
        .eq("route_id", selectedRoute)
        .eq("date", today)
        .maybeSingle();

      // Save daily stock to database
      const stockData: any = {
        auth_user_id: user.id,
        route_id: selectedRoute,
        date: today,
        stock: nonZeroStock,
      };

      let error;
      if (existingStock) {
        // Update existing stock
        const { error: updateError } = await supabase
          .from("daily_stock")
          .update(stockData)
          .eq("id", existingStock.id);
        error = updateError;
      } else {
        // Insert new stock
        const { error: insertError } = await supabase
          .from("daily_stock")
          .insert(stockData);
        error = insertError;
      }

      if (error) {
        throw error;
      }

      // Store route in localStorage for use in other pages
      localStorage.setItem('currentRoute', selectedRoute);
      localStorage.setItem('currentDate', today);

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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-light via-background to-accent-light flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-primary-light/10">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-9 w-9 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-r from-business-blue to-business-blue-dark rounded-lg sm:rounded-xl flex items-center justify-center">
                <Route className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-foreground">Start Route</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">Setup your daily inventory</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-safe">
        <Card className="border-0 shadow-strong">
          <CardHeader className="text-center pb-4 sm:pb-6 px-4 sm:px-6">
            <CardTitle className="text-xl sm:text-2xl font-bold">Route Configuration</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Select your route and set initial stock levels
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-4 sm:px-6">
            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
              {/* Route Selection */}
              <div className="space-y-2">
                <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <Route className="w-4 h-4" />
                  Select Route
                </Label>
                <div className="flex gap-2">
                  <Select value={selectedRoute} onValueChange={setSelectedRoute} required>
                    <SelectTrigger className="h-11 sm:h-10 text-base flex-1">
                      <SelectValue placeholder="Choose your route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map((route) => {
                        const isCustomRoute = !['Route 1', 'Route 2', 'Route 3'].includes(route.displayName || route.name);
                        return (
                          <div key={route.id} className="flex items-center justify-between group">
                            <SelectItem value={route.id} className="text-base py-3 flex-1">
                              {route.displayName || route.name}
                            </SelectItem>
                            {isCustomRoute && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity mr-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Route</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{route.displayName || route.name}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteRoute(route.id)}
                                      disabled={deletingRoute}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {deletingRoute ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  
                  <Dialog open={showNewRouteDialog} onOpenChange={setShowNewRouteDialog}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 sm:h-10 w-11 sm:w-10 flex-shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create New Route</DialogTitle>
                        <DialogDescription>
                          Add a new route to your system. It will be available for immediate use.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="route-name">Route Name</Label>
                          <Input
                            id="route-name"
                            placeholder="e.g., Route 4, Route 5..."
                            value={newRouteName}
                            onChange={(e) => setNewRouteName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                createNewRoute();
                              }
                            }}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setShowNewRouteDialog(false);
                              setNewRouteName("");
                            }}
                            disabled={creatingRoute}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={createNewRoute}
                            disabled={creatingRoute || !newRouteName.trim()}
                          >
                            {creatingRoute ? "Creating..." : "Create Route"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Stock Configuration */}
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                    Initial Stock
                  </Label>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-primary">{totalProducts}</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:gap-4">
                  {products.map((product) => {
                    const stockItem = stock.find(s => s.productId === product.id);
                    const quantity = stockItem?.quantity || 0;
                    
                    return (
                      <Card key={product.id} className="border border-border hover:border-primary/50 transition-colors active:border-primary">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-base">{product.name}</h4>
                              <p className="text-sm text-muted-foreground">₹{product.price.toFixed(2)} per unit</p>
                            </div>
                            
                            <div className="flex items-center gap-2 sm:gap-3 justify-end sm:justify-start">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => updateStock(product.id, -1)}
                                disabled={quantity === 0}
                                className="h-10 w-10 sm:h-9 sm:w-9 touch-manipulation"
                              >
                                <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
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
                                className="w-16 sm:w-20 text-center text-base h-10 sm:h-9"
                                min="0"
                                inputMode="numeric"
                              />
                              
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => updateStock(product.id, 1)}
                                className="h-10 w-10 sm:h-9 sm:w-9 touch-manipulation"
                              >
                                <Plus className="w-5 h-5 sm:w-4 sm:h-4" />
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
                className="w-full h-12 sm:h-11 text-base font-semibold touch-manipulation"
                disabled={loading || !selectedRoute || totalProducts === 0}
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