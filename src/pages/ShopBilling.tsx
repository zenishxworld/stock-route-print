import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { mapRouteName } from "@/lib/routeUtils";
import { listenForProductUpdates } from "@/lib/productSync";
import { ArrowLeft, ShoppingCart, Plus, Minus, Printer, Store, Check, RefreshCw, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
}

interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  availableStock: number;
}

const ShopBilling = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  
  const [shopName, setShopName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [currentRoute, setCurrentRoute] = useState("");
  const [currentRouteName, setCurrentRouteName] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  // Shop name suggestions state
  const [shopSuggestions, setShopSuggestions] = useState<string[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load previously used shop names (local + remote) for suggestions
  const loadShopSuggestions = async (routeId: string) => {
    try {
      const localKey = `shopNames:${routeId}`;
      const hiddenKey = `shopNames:hidden:${routeId}`;
      const local = JSON.parse(localStorage.getItem(localKey) || '[]');
      const hidden = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
      const namesSet = new Set<string>(Array.isArray(local) ? local : []);
      const hiddenSet = new Set<string>(Array.isArray(hidden) ? hidden : []);
    
      // Fetch shop names from sales table for this route
      const { data, error } = await supabase
        .from("sales")
        .select("shop_name")
        .eq("route_id", routeId);
    
      if (!error && data) {
        data.forEach((row: any) => {
          const name = (row.shop_name || '').trim();
          if (name && !hiddenSet.has(name)) namesSet.add(name);
        });
      }
    
      const names = Array.from(namesSet).filter(n => !hiddenSet.has(n)).sort((a, b) => a.localeCompare(b));
      setShopSuggestions(names);
      localStorage.setItem(localKey, JSON.stringify(names));
    } catch (err) {
      // Ignore errors, suggestions are non-critical
      console.warn('Failed to load shop suggestions', err);
    }
  };

  // Save a shop name to local suggestions cache
  const saveShopNameToLocal = (routeId: string, name: string) => {
    const localKey = `shopNames:${routeId}`;
    const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
    let updated: string[] = Array.isArray(existing) ? existing : [];
    if (!updated.includes(name)) {
      updated = [name, ...updated].slice(0, 100); // keep recent up to 100
      localStorage.setItem(localKey, JSON.stringify(updated));
    }
    setShopSuggestions(prev => (prev.includes(name) ? prev : [name, ...prev]));
  };

  const removeShopName = (routeId: string, name: string) => {
    const localKey = `shopNames:${routeId}`;
    const hiddenKey = `shopNames:hidden:${routeId}`;
    const existingLocal = JSON.parse(localStorage.getItem(localKey) || '[]');
    let updatedLocal: string[] = Array.isArray(existingLocal) ? existingLocal : [];
    updatedLocal = updatedLocal.filter(n => n !== name);
    localStorage.setItem(localKey, JSON.stringify(updatedLocal));

    const existingHidden = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
    let updatedHidden: string[] = Array.isArray(existingHidden) ? existingHidden : [];
    if (!updatedHidden.includes(name)) {
      updatedHidden.push(name);
      localStorage.setItem(hiddenKey, JSON.stringify(updatedHidden));
    }

    setShopSuggestions(prev => prev.filter(n => n !== name));
    setFilteredSuggestions(prev => prev.filter(n => n !== name));
  };
  useEffect(() => {
    // Get current route and date from localStorage
    const route = localStorage.getItem('currentRoute');
    const date = localStorage.getItem('currentDate') || new Date().toISOString().split('T')[0];
    
    if (!route) {
      toast({
        title: "No Active Route",
        description: "Please start a route first",
        variant: "destructive",
      });
      navigate('/start-route');
      return;
    }
    
    setCurrentRoute(route);
    setCurrentDate(date);
    fetchProductsAndStock(route, date);
    // Load shop name suggestions for this route
    loadShopSuggestions(route);
  }, []);

  // Listen for product updates from other pages
  useEffect(() => {
    const cleanup = listenForProductUpdates((event) => {
      console.log('ShopBilling received product update event:', event);
      if (event.type === 'product-updated' || event.type === 'product-deleted') {
        console.log('Refreshing ShopBilling data due to product update');
        // Refresh products data when products are updated elsewhere
        if (currentRoute && currentDate) {
          fetchProductsAndStock(currentRoute, currentDate);
        }
      }
    });

    return cleanup;
  }, [currentRoute, currentDate]);

  const fetchProductsAndStock = async (route: string, date: string) => {
    try {
      // Fetch route name
      const { data: routeData, error: routeError } = await supabase
        .from("routes")
        .select("name")
        .eq("id", route)
        .single();

      if (routeError) throw routeError;
      if (routeData) {
        setCurrentRouteName(mapRouteName(routeData.name));
      }

      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active");

      if (productsError) throw productsError;
      if (!productsData) return;

      setProducts(productsData);

      // Fetch initial stock for today
      const { data: stockData, error: stockError } = await supabase
        .from("daily_stock")
        .select("*")
        .eq("route_id", route)
        .eq("date", date)
        .maybeSingle();

      if (stockError && stockError.code !== 'PGRST116') throw stockError;

      // Fetch all sales for today to calculate remaining stock
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("*")
        .eq("route_id", route)
        .eq("date", date);

      if (salesError && salesError.code !== 'PGRST116') throw salesError;

      // Calculate remaining stock for each product
      const saleItemsWithStock = productsData.map(product => {
        // Get initial stock
        let initialStock = 0;
        if (stockData && stockData.stock) {
          const stockItem = (stockData.stock as any[]).find(
            (s: any) => s.productId === product.id
          );
          initialStock = stockItem?.quantity || 0;
        }

        // Calculate total sold
        let totalSold = 0;
        if (salesData) {
          salesData.forEach(sale => {
            if (sale.products_sold) {
              const saleItem = (sale.products_sold as any[]).find(
                (p: any) => p.productId === product.id
              );
              totalSold += saleItem?.quantity || 0;
            }
          });
        }

        const availableStock = initialStock - totalSold;

        return {
          productId: product.id,
          productName: product.name,
          quantity: 0,
          price: product.price,
          total: 0,
          availableStock: Math.max(0, availableStock),
        };
      });

      setSaleItems(saleItemsWithStock);

      // Show warning if no stock was set
      if (!stockData) {
        toast({
          title: "No Stock Set",
          description: "Please set initial stock for today's route first",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load products and stock",
        variant: "destructive",
      });
    }
  };

  const updateQuantity = (productId: string, change: number) => {
    setSaleItems(prev =>
      prev.map(item => {
        if (item.productId === productId) {
          const newQuantity = Math.max(0, Math.min(item.availableStock, item.quantity + change));
          return {
            ...item,
            quantity: newQuantity,
            total: newQuantity * item.price,
          };
        }
        return item;
      })
    );
  };

  const setQuantityDirect = (productId: string, quantity: number) => {
    setSaleItems(prev =>
      prev.map(item => {
        if (item.productId === productId) {
          const newQuantity = Math.max(0, Math.min(item.availableStock, quantity));
          return {
            ...item,
            quantity: newQuantity,
            total: newQuantity * item.price,
          };
        }
        return item;
      })
    );
  };

  const updatePrice = (productId: string, newPrice: number) => {
    setSaleItems(prev =>
      prev.map(item => {
        if (item.productId === productId) {
          const validPrice = Math.max(1, newPrice); // Ensure price >= 1
          return {
            ...item,
            price: validPrice,
            total: item.quantity * validPrice,
          };
        }
        return item;
      })
    );
  };

  const calculateTotal = () => {
    return saleItems.reduce((sum, item) => sum + item.total, 0);
  };

  const getSoldItems = () => {
    return saleItems.filter(item => item.quantity > 0);
  };

  const isValidForBilling = () => {
    const soldItems = getSoldItems();
    return soldItems.length > 0 && soldItems.every(item => 
      item.quantity > 0 && item.price >= 1
    );
  };

  const handleGenerateBill = () => {
    if (!shopName.trim()) {
      toast({
        title: "Error",
        description: "Please enter shop name",
        variant: "destructive",
      });
      return;
    }

    if (!isValidForBilling()) {
      toast({
        title: "Error",
        description: "Please add at least one product with valid quantity and price (≥₹1)",
        variant: "destructive",
      });
      return;
    }

    setShowBill(true);
  };

  const handlePrintBill = async () => {
    setLoading(true);
    
    try {
      // First save the sale to database
      const mockUserId = "00000000-0000-0000-0000-000000000000";
      const soldItems = getSoldItems();
      
      const saleData = {
        auth_user_id: mockUserId,
        shop_name: shopName,
        date: currentDate,
        products_sold: soldItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })),
        total_amount: calculateTotal(),
        route_id: currentRoute,
        truck_id: "00000000-0000-0000-0000-000000000000", // Placeholder for truck
      };

      // Save sale to database
      const { error } = await supabase.from("sales").insert(saleData);

      if (error) {
        throw error;
      }

      // Save shop name to local suggestions for quick reuse
      if (currentRoute && shopName.trim()) {
        saveShopNameToLocal(currentRoute, shopName.trim());
      }

      // Print the bill
      window.print();

      toast({
        title: "Success!",
        description: "Bill printed and sale recorded successfully",
      });

      // Reset form and refresh stock after successful print
      setTimeout(() => {
        setShopName("");
        setShowBill(false);
        // Refresh stock to get updated available quantities
        fetchProductsAndStock(currentRoute, currentDate);
      }, 500);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save sale",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToForm = () => {
    setShowBill(false);
  };

  const totalAmount = calculateTotal();
  const soldItemsCount = getSoldItems().length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-success-green-light/10">
      {/* Header - Hidden when printing */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-9 w-9 p-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-r from-success-green to-accent rounded-lg sm:rounded-xl flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">Shop Billing</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">Create bills for shop sales</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentRouteName && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Route</p>
                  <p className="text-sm sm:text-base font-semibold text-primary">{currentRouteName}</p>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (currentRoute && currentDate) {
                    fetchProductsAndStock(currentRoute, currentDate);
                  }
                }}
                className="h-9 w-9 p-0"
                title="Refresh products"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-safe">
        {!showBill ? (
          // Billing Form
          <Card className="border-0 shadow-strong">
            <CardHeader className="text-center pb-4 sm:pb-6 px-4 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl font-bold">New Sale</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Enter shop details and select products
              </CardDescription>
              {currentRouteName && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm font-semibold text-primary">
                    📍 Route: {currentRouteName}
                  </p>
                </div>
              )}
            </CardHeader>
            
            <CardContent className="px-4 sm:px-6">
              <div className="space-y-6 sm:space-y-8">
                {/* Shop Name */}
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <Store className="w-4 h-4" />
                    Shop Name
                  </Label>
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Enter shop name"
                      value={shopName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setShopName(value);
                        if (value.trim().length >= 1) {
                          const match = shopSuggestions
                            .filter(n => n.toLowerCase().startsWith(value.toLowerCase()))
                            .slice(0, 8);
                          setFilteredSuggestions(match);
                          setShowSuggestions(match.length > 0);
                        } else {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        if (shopName.trim().length >= 1) {
                          const match = shopSuggestions
                            .filter(n => n.toLowerCase().startsWith(shopName.toLowerCase()))
                            .slice(0, 8);
                          setFilteredSuggestions(match);
                          setShowSuggestions(match.length > 0);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      className="h-11 sm:h-10 text-base"
                      required
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-2 bg-background border border-border rounded-md shadow-soft max-h-48 overflow-auto">
                        {filteredSuggestions.map((name) => (
                          <div
                            key={name}
                            className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted text-sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setShopName(name);
                              setShowSuggestions(false);
                            }}
                          >
                            <span className="truncate">{name}</span>
                            <button
                              type="button"
                              className="ml-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              title="Remove"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (currentRoute) {
                                  removeShopName(currentRoute, name);
                                  const value = shopName.trim();
                                  if (value.length >= 1) {
                                    const match = shopSuggestions
                                      .filter(n => n.toLowerCase().startsWith(value.toLowerCase()))
                                      .slice(0, 8);
                                    setFilteredSuggestions(match);
                                    setShowSuggestions(match.length > 0);
                                  } else {
                                    setShowSuggestions(false);
                                  }
                                }
                              }}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Products Selection */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base sm:text-lg font-semibold flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                      Select Products
                    </Label>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      Items: <span className="font-semibold text-primary">{soldItemsCount}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:gap-4">
                    {products.map((product) => {
                      const saleItem = saleItems.find(s => s.productId === product.id);
                      const quantity = saleItem?.quantity || 0;
                      const availableStock = saleItem?.availableStock || 0;
                      
                      return (
                        <Card key={product.id} className={`border transition-colors active:border-primary ${
                          availableStock === 0 ? 'border-destructive/50 opacity-60' : 'border-border hover:border-primary/50'
                        }`}>
                          <CardContent className="p-3 sm:p-4">
                            <div className="space-y-3">
                              {/* Product Info */}
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-foreground text-base">{product.name}</h4>
                                {availableStock === 0 && (
                                  <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                                    Out of Stock
                                  </span>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Price Input */}
                                <div className="space-y-1">
                                  <Label className="text-xs font-medium text-muted-foreground">Unit Price (₹)</Label>
                                  <Input
                                    type="number"
                                    value={saleItem?.price || product.price}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || product.price;
                                      updatePrice(product.id, newPrice);
                                    }}
                                    className="h-9 text-sm"
                                    min="1"
                                    step="0.01"
                                    disabled={availableStock === 0}
                                    placeholder={`${product.price}`}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Default: ₹{product.price.toFixed(2)}
                                  </p>
                                </div>
                                
                                {/* Quantity Controls */}
                                <div className="space-y-1">
                                  <Label className="text-xs font-medium text-muted-foreground">Quantity</Label>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => updateQuantity(product.id, -1)}
                                      disabled={quantity === 0}
                                      className="h-9 w-9 touch-manipulation"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </Button>
                                    
                                    <Input
                                      type="number"
                                      value={quantity}
                                      onChange={(e) => {
                                        const newQuantity = Math.max(0, parseInt(e.target.value) || 0);
                                        setQuantityDirect(product.id, newQuantity);
                                      }}
                                      max={availableStock}
                                      className="w-16 text-center text-sm h-9"
                                      min="0"
                                      inputMode="numeric"
                                      disabled={availableStock === 0}
                                    />
                                    
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => updateQuantity(product.id, 1)}
                                      disabled={quantity >= availableStock || availableStock === 0}
                                      className="h-9 w-9 touch-manipulation"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Stock and Total Info */}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-warning">
                                    Available: {availableStock} units
                                  </p>
                                </div>
                                {quantity > 0 && (
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-success-green">
                                      Line Total: ₹{(quantity * (saleItem?.price || product.price)).toFixed(2)}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Total Amount */}
                <div className="bg-primary-light/20 border-2 border-primary rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg sm:text-xl font-bold text-foreground">Total Amount:</span>
                    <span className="text-2xl sm:text-3xl font-bold text-primary">₹{totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Generate Bill Button */}
                <div className="sticky bottom-4 sm:static bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none p-2 sm:p-0 -mx-2 sm:mx-0 rounded-lg sm:rounded-none">
                  <Button
                    onClick={handleGenerateBill}
                    variant="success"
                    size="lg"
                    className="w-full h-12 sm:h-11 text-base font-semibold touch-manipulation shadow-lg sm:shadow-none"
                    disabled={!shopName.trim() || !isValidForBilling()}
                  >
                    <Check className="w-5 h-5 mr-2" />
                    Generate Bill
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Bill Preview & Print
          <div className="space-y-4">
            {/* Print Preview Card - Hidden when printing */}
            <Card className="border-0 shadow-strong print:hidden">
              <CardHeader className="text-center pb-4 px-4 sm:px-6">
                <CardTitle className="text-xl sm:text-2xl font-bold text-success-green">Bill Generated!</CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Review and print the bill
                </CardDescription>
              </CardHeader>
              
              <CardContent className="px-4 sm:px-6 space-y-4">
                <div className="sticky bottom-4 sm:static bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none p-2 sm:p-0 -mx-2 sm:mx-0 rounded-lg sm:rounded-none">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handlePrintBill}
                      variant="success"
                      size="lg"
                      className="flex-1 h-12 sm:h-11 text-base font-semibold touch-manipulation w-full sm:w-auto shadow-lg sm:shadow-none"
                      disabled={loading}
                    >
                      <Printer className="w-5 h-5 mr-2" />
                      {loading ? "Printing..." : "Print Bill"}
                    </Button>
                    <Button
                      onClick={handleBackToForm}
                      variant="outline"
                      size="lg"
                      className="h-12 sm:h-11 px-6 touch-manipulation w-full sm:w-auto shadow-lg sm:shadow-none"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Printable Bill */}
            <div ref={printRef} className="receipt print:p-0 print:bg-white print:text-black print:font-mono print:w-[72mm] print:mx-auto">
              <Card className="border-0 shadow-strong print:shadow-none print:border-0">
                <CardContent className="p-6 sm:p-8 print:p-2">
                  {/* Bill Header */}
                  <div className="text-center mb-6 print:mb-3">
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground print:text-lg">BHAVYA ENTERPRICE</h1>
                    <p className="text-sm font-semibold text-foreground print:text-[10px]">Sales Invoice</p>
                    {/* Address (no spacing between lines) */}
                    <div className="mt-1 text-xs text-foreground print:text-[10px]">
                      <p className="leading-tight">Near Bala petrol pump</p>
                      <p className="leading-tight">Jambusar Bharuch road</p>
                    </div>
                    {/* Space after address, then phone and GSTIN with no spacing between them */}
                    <div className="mt-2 text-xs text-foreground print:text-[10px]">
                      <p className="leading-tight">Phone no.: 8866756059</p>
                      <p className="leading-tight">GSTIN: 24EVVPS8220P1ZF</p>
                    </div>
                    {/* Date/Time in black */}
                    <div className="mt-2 text-xs text-foreground print:text-[10px]">
                      <p className="leading-tight">Date: {new Date().toLocaleDateString('en-IN', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}</p>
                      {currentRouteName && (
                        <p className="font-semibold text-primary">Route: {currentRouteName}</p>
                      )}
                    </div>
                  </div>

                  {/* Shop Details */}
                  <div className="mb-6 print:mb-3 pb-3 border-t border-b border-dashed">
                    <div className="flex items-center gap-2 mb-1">
                      <Store className="w-5 h-5 text-primary print:w-4 print:h-4" />
                      <span className="font-semibold text-foreground print:text-[11px]">Shop:</span>
                    </div>
                    <p className="text-lg font-bold text-foreground pl-7 print:text-sm">{shopName}</p>
                  </div>

                  {/* Products Table */}
                  <div className="mb-6 print:mb-3">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-foreground border-dashed">
                          <th className="text-left py-2 font-bold text-foreground print:text-[11px] print:py-1">Item</th>
                          <th className="text-center py-2 font-bold text-foreground print:text-[11px] print:py-1">Qty</th>
                          <th className="text-right py-2 font-bold text-foreground print:text-[11px] print:py-1">Rate</th>
                          <th className="text-right py-2 font-bold text-foreground print:text-[11px] print:py-1">Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSoldItems().map((item, index) => (
                          <tr key={item.productId} className="border-b border-border">
                            <td className="py-3 text-foreground print:text-[11px] print:py-1">{item.productName}</td>
                            <td className="py-3 text-center text-foreground print:text-[11px] print:py-1">{item.quantity}</td>
                            <td className="py-3 text-right text-foreground print:text-[11px] print:py-1">₹{item.price.toFixed(2)}</td>
                            <td className="py-3 text-right font-semibold text-foreground print:text-[11px] print:py-1">₹{item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Section */}
                  <div className="border-t border-foreground border-dashed pt-3 print:pt-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-lg font-bold text-foreground print:text-sm">TOTAL:</span>
                      <span className="text-2xl font-bold text-primary print:text-base">₹{totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground text-right print:text-[10px]">
                      Items: {soldItemsCount}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-6 pt-3 border-t border-dashed text-center print:mt-4 print:pt-2">
                    <p className="text-sm font-semibold text-foreground print:text-[10px]">Thank you for your business!</p>
                    <p className="text-xs text-muted-foreground mt-1 print:text-[9px]">Have a great day!</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background-color: #fff;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
          
          /* Set page size for 80mm roll printer */
          @page {
            size: 80mm auto;
            margin: 3mm;
          }
          
          .receipt {
            width: 72mm !important;
            margin: 0 auto !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
            color: #000 !important;
          }
      
          .print-container {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
      
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ShopBilling;
