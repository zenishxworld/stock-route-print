import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShoppingCart, Plus, Minus, Printer, Store, Check } from "lucide-react";

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
  }, []);

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
        setCurrentRouteName(routeData.name);
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
            {currentRouteName && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Route</p>
                <p className="text-sm sm:text-base font-semibold text-primary">{currentRouteName}</p>
              </div>
            )}
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
                  <Input
                    type="text"
                    placeholder="Enter shop name"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="h-11 sm:h-10 text-base"
                    required
                  />
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
            <div ref={printRef} className="print:p-0">
              <Card className="border-0 shadow-strong print:shadow-none print:border-0">
                <CardContent className="p-6 sm:p-8 print:p-4">
                  {/* Bill Header */}
                  <div className="text-center mb-6 print:mb-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground print:text-xl">Cold Drink Sales</h1>
                    <p className="text-sm text-muted-foreground print:text-xs">Sales Invoice</p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground print:text-[10px]">
                      <p>Date: {new Date().toLocaleDateString('en-IN', { 
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
                  <div className="mb-6 print:mb-4 pb-4 border-b-2 border-dashed">
                    <div className="flex items-center gap-2 mb-2">
                      <Store className="w-5 h-5 text-primary print:w-4 print:h-4" />
                      <span className="font-semibold text-foreground print:text-sm">Shop Name:</span>
                    </div>
                    <p className="text-lg font-bold text-foreground pl-7 print:text-base">{shopName}</p>
                  </div>

                  {/* Products Table */}
                  <div className="mb-6 print:mb-4">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-foreground">
                          <th className="text-left py-2 font-bold text-foreground print:text-sm print:py-1">Product</th>
                          <th className="text-center py-2 font-bold text-foreground print:text-sm print:py-1">Qty</th>
                          <th className="text-right py-2 font-bold text-foreground print:text-sm print:py-1">Price</th>
                          <th className="text-right py-2 font-bold text-foreground print:text-sm print:py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSoldItems().map((item, index) => (
                          <tr key={item.productId} className="border-b border-border">
                            <td className="py-3 text-foreground print:text-sm print:py-2">{item.productName}</td>
                            <td className="py-3 text-center text-foreground print:text-sm print:py-2">{item.quantity}</td>
                            <td className="py-3 text-right text-foreground print:text-sm print:py-2">₹{item.price.toFixed(2)}</td>
                            <td className="py-3 text-right font-semibold text-foreground print:text-sm print:py-2">₹{item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Section */}
                  <div className="border-t-2 border-foreground pt-4 print:pt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-lg font-bold text-foreground print:text-base">TOTAL:</span>
                      <span className="text-2xl font-bold text-primary print:text-xl">₹{totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground text-right print:text-[10px]">
                      Items: {soldItemsCount}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-8 pt-4 border-t border-dashed text-center print:mt-6 print:pt-3">
                    <p className="text-sm font-semibold text-foreground print:text-xs">Thank you for your business!</p>
                    <p className="text-xs text-muted-foreground mt-1 print:text-[10px]">Have a great day!</p>
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
          }
          
          @page {
            size: 80mm auto;
            margin: 5mm;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:p-0 {
            padding: 0 !important;
          }
          
          .print\\:p-4 {
            padding: 1rem !important;
          }
          
          .print\\:mb-4 {
            margin-bottom: 1rem !important;
          }
          
          .print\\:mb-3 {
            margin-bottom: 0.75rem !important;
          }
          
          .print\\:mt-6 {
            margin-top: 1.5rem !important;
          }
          
          .print\\:pt-3 {
            padding-top: 0.75rem !important;
          }
          
          .print\\:py-1 {
            padding-top: 0.25rem !important;
            padding-bottom: 0.25rem !important;
          }
          
          .print\\:py-2 {
            padding-top: 0.5rem !important;
            padding-bottom: 0.5rem !important;
          }
          
          .print\\:text-xs {
            font-size: 0.75rem !important;
            line-height: 1rem !important;
          }
          
          .print\\:text-sm {
            font-size: 0.875rem !important;
            line-height: 1.25rem !important;
          }
          
          .print\\:text-base {
            font-size: 1rem !important;
            line-height: 1.5rem !important;
          }
          
          .print\\:text-xl {
            font-size: 1.25rem !important;
            line-height: 1.75rem !important;
          }
          
          .print\\:text-\\[10px\\] {
            font-size: 10px !important;
          }
          
          .print\\:w-4 {
            width: 1rem !important;
          }
          
          .print\\:h-4 {
            height: 1rem !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .print\\:border-0 {
            border-width: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ShopBilling;
