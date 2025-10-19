import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { mapRouteName, shouldDisplayRoute } from "@/lib/routeUtils";
import { listenForProductUpdates } from "@/lib/productSync";
import { ArrowLeft, BarChart3, Printer, Calendar, TrendingUp, Package, DollarSign } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  pcs_price?: number;
  box_price?: number;
}

interface RouteOption {
  id: string;
  name: string;
}

interface SummaryItem {
  productId: string;
  productName: string;
  startQty: number;
  soldQty: number;
  remainingQty: number;
  price: number;
  totalRevenue: number;
}

// Normalize sales.products_sold to a flat array of items
function normalizeSaleProducts(ps: any): any[] {
  if (!ps) return [];
  if (Array.isArray(ps)) return ps;
  if (Array.isArray(ps?.items)) return ps.items;
  if (typeof ps === 'string') {
    try {
      const parsed = JSON.parse(ps);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.items)) return parsed.items;
    } catch {}
  }
  return [];
}

const Summary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    fetchRoutes();
  }, []);

  // Listen for product updates from other pages
  useEffect(() => {
    const cleanup = listenForProductUpdates((event) => {
      if (event.type === 'product-updated' || event.type === 'product-deleted') {
        // Refresh data when products are updated elsewhere
        if (selectedRoute && selectedDate) {
          generateSummary();
        }
      }
    });

    return cleanup;
  }, [selectedRoute, selectedDate]);

  const fetchRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from("routes")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      if (data) {
        // Apply mapping and filtering to routes before setting state
        const mappedAndFilteredRoutes = data
          .filter(route => shouldDisplayRoute(route.name))
          .map(route => ({
            ...route,
            name: mapRouteName(route.name), // Apply the mapping here
          }));
        setRoutes(mappedAndFilteredRoutes);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load routes",
        variant: "destructive",
      });
    }
  };

  const generateSummary = async () => {
    if (!selectedRoute) {
      toast({
        title: "Error",
        description: "Please select a route",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Fetch all products
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active");

      if (productsError) throw productsError;

      // Fetch daily stock for the selected date and route
      const { data: dailyStock, error: stockError } = await supabase
        .from("daily_stock")
        .select("*")
        .eq("route_id", selectedRoute)
        .eq("date", selectedDate)
        .maybeSingle();

      // Fetch all sales for the selected date and route
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("*")
        .eq("route_id", selectedRoute)
        .eq("date", selectedDate);

      if (salesError && salesError.code !== 'PGRST116') throw salesError;

      // Calculate summary
      const summary: SummaryItem[] = [];
      
      if (products) {
        products.forEach(product => {
          // Compute initial stock in pcs (box*24 + pcs)
          let startBox = 0;
          let startPcs = 0;
          if (dailyStock && dailyStock.stock && Array.isArray(dailyStock.stock)) {
            const stockItems = dailyStock.stock as any[];
            const boxStock = stockItems.find((s: any) => s.productId === product.id && s.unit === 'box');
            const pcsStock = stockItems.find((s: any) => s.productId === product.id && (s.unit === 'pcs' || !('unit' in s)));
            startBox = boxStock?.quantity || 0;
            startPcs = pcsStock?.quantity || 0;
          }
          const startQty = (startBox * 24) + startPcs;

          // Calculate total sold quantity in pcs and revenue from line items
          let soldQty = 0;
          let totalRevenue = 0;
          const boxPrice = product.price; // box_price is not in the Product type, fallback to price
          const pcsPrice = (product as any).pcs_price ?? (((product as any).box_price ?? product.price) / 24);

          if (sales) {
            sales.forEach(sale => {
              const items = normalizeSaleProducts(sale.products_sold);
              items.forEach((p: any) => {
                if (p.productId === product.id) {
                  const u = p.unit || 'pcs';
                  const q = p.quantity || 0;
                  // Sum sold pcs
                  soldQty += u === 'box' ? (q * 24) : q;
                  // Sum revenue using saved total or fallback to price
                  const lineTotal = typeof p.total === 'number'
                    ? p.total
                    : q * (typeof p.price === 'number' ? p.price : (u === 'box' ? boxPrice : pcsPrice));
                  totalRevenue += lineTotal;
                }
              });
            });
          }

          // Only include products that were loaded or sold
          if (startQty > 0 || soldQty > 0) {
            summary.push({
              productId: product.id,
              productName: product.name,
              startQty,
              soldQty,
              remainingQty: Math.max(0, startQty - soldQty),
              price: boxPrice,
              totalRevenue,
            });
          }
        });
      }

      setSummaryData(summary);
      setShowSummary(true);

      if (summary.length === 0) {
        toast({
          title: "No Data",
          description: "No sales or stock data found for the selected date and route",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const calculateGrandTotal = () => {
    return summaryData.reduce((sum, item) => sum + item.totalRevenue, 0);
  };

  const calculateTotalSold = () => {
    return summaryData.reduce((sum, item) => sum + item.soldQty, 0);
  };

  const calculateTotalRemaining = () => {
    return summaryData.reduce((sum, item) => sum + item.remainingQty, 0);
  };

  const calculateTotalStock = () => {
    // Total stock = items sold + items remaining
    return calculateTotalSold() + calculateTotalRemaining();
  };

  const getRouteName = () => {
    const route = routes.find(r => r.id === selectedRoute);
    if (!route) return "Unknown Route";
    
    // route names are already mapped in fetchRoutes
    return route.name;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent-light/10">
      {/* Header - Hidden when printing */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-9 w-9 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-r from-primary to-primary-dark rounded-lg sm:rounded-xl flex items-center justify-center">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-foreground">Day Summary</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">View daily sales report</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-safe">
        {!showSummary ? (
          // Filter Form
          <Card className="border-0 shadow-strong">
            <CardHeader className="text-center pb-4 sm:pb-6 px-4 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl font-bold">Generate Day Summary</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Select date and route to view sales report
              </CardDescription>
            </CardHeader>
            
            <CardContent className="px-4 sm:px-6">
              <div className="space-y-6 sm:space-y-8">
                {/* Date Selection */}
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Select Date
                  </Label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full h-11 sm:h-10 px-3 text-base rounded-md border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>

                {/* Route Selection */}
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Select Route
                  </Label>
                  <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                    <SelectTrigger className="h-11 sm:h-10 text-base">
                      <SelectValue placeholder="Choose route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map((route) => (
                        <SelectItem key={route.id} value={route.id} className="text-base py-3">
                          {route.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={generateSummary}
                  variant="default"
                  size="lg"
                  className="w-full h-12 sm:h-11 text-base font-semibold touch-manipulation"
                  disabled={loading || !selectedRoute}
                >
                  <BarChart3 className="w-5 h-5 mr-2" />
                  {loading ? "Generating..." : "Generate Summary"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Summary Report
          <div className="space-y-4">
            {/* Action Buttons - Hidden when printing */}
            <Card className="border-0 shadow-strong print:hidden">
              <CardContent className="p-4 sm:p-6">
                <div className="flex gap-3">
                  <Button
                    onClick={handlePrint}
                    variant="default"
                    size="lg"
                    className="flex-1 h-12 sm:h-11 text-base font-semibold touch-manipulation"
                  >
                    <Printer className="w-5 h-5 mr-2" />
                    Print Summary
                  </Button>
                  <Button
                    onClick={() => setShowSummary(false)}
                    variant="outline"
                    size="lg"
                    className="h-12 sm:h-11 px-6 touch-manipulation"
                  >
                    Back
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Printable Summary Report */}
            <Card className="border-0 shadow-strong print:shadow-none">
              <CardContent className="p-4 sm:p-8 print:p-4">
                {/* Report Header */}
                <div className="text-center mb-6 print:mb-4">
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground print:text-xl">Cold Drink Sales</h1>
                  <p className="text-base sm:text-lg font-semibold text-muted-foreground print:text-sm">Day Summary Report</p>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground print:text-xs print:mt-2">
                    <p><strong>Date:</strong> {new Date(selectedDate).toLocaleDateString('en-IN', { 
                      day: '2-digit', 
                      month: 'long', 
                      year: 'numeric' 
                    })}</p>
                    <p><strong>Route:</strong> {getRouteName()}</p>
                  </div>
                </div>

                {/* Stats Cards - Hidden on print */}
                <div className="grid grid-cols-4 gap-3 mb-6 print:hidden">
                  <Card className="border border-primary/20 bg-primary-light/10">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <Package className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 text-primary" />
                      <p className="text-lg sm:text-xl font-bold text-primary">{calculateTotalStock()}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Total Stock</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-primary/20 bg-primary-light/10">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <Package className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 text-primary" />
                      <p className="text-lg sm:text-xl font-bold text-primary">{calculateTotalSold()}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Sold</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="border border-warning/20 bg-warning-light/10">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <Package className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 text-warning" />
                      <p className="text-lg sm:text-xl font-bold text-warning">{calculateTotalRemaining()}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Remaining</p>
                    </CardContent>
                  </Card>

                  <Card className="border border-success-green/20 bg-success-green-light/10">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 text-success-green" />
                      <p className="text-lg sm:text-xl font-bold text-success-green">₹{calculateGrandTotal().toFixed(2)}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Revenue</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Summary Table */}
                <div className="mb-6 print:mb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-foreground">
                        <th className="text-left py-2 sm:py-3 font-bold text-foreground print:text-xs print:py-1">Product</th>
                        <th className="text-center py-2 sm:py-3 font-bold text-foreground print:text-xs print:py-1">Start</th>
                        <th className="text-center py-2 sm:py-3 font-bold text-foreground print:text-xs print:py-1">Sold</th>
                        <th className="text-center py-2 sm:py-3 font-bold text-foreground print:text-xs print:py-1">Left</th>
                        <th className="text-right py-2 sm:py-3 font-bold text-foreground print:text-xs print:py-1">Price</th>
                        <th className="text-right py-2 sm:py-3 font-bold text-foreground print:text-xs print:py-1">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.map((item) => (
                        <tr key={item.productId} className="border-b border-border">
                          <td className="py-3 text-foreground font-medium print:text-xs print:py-2">{item.productName}</td>
                          <td className="py-3 text-center text-muted-foreground print:text-xs print:py-2">{item.startQty}</td>
                          <td className="py-3 text-center text-primary font-semibold print:text-xs print:py-2">{item.soldQty}</td>
                          <td className="py-3 text-center text-warning font-semibold print:text-xs print:py-2">{item.remainingQty}</td>
                          <td className="py-3 text-right text-muted-foreground print:text-xs print:py-2">₹{item.price.toFixed(2)}</td>
                          <td className="py-3 text-right font-semibold text-success-green print:text-xs print:py-2">₹{item.totalRevenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Section */}
                <div className="border-t-2 border-foreground pt-4 print:pt-3 space-y-2">
                  <div className="flex justify-between items-center text-sm sm:text-base print:text-xs">
                    <span className="font-semibold text-muted-foreground">Total Items Sold:</span>
                    <span className="font-bold text-primary">{calculateTotalSold()} units</span>
                  </div>
                  <div className="flex justify-between items-center text-sm sm:text-base print:text-xs">
                    <span className="font-semibold text-muted-foreground">Total Remaining:</span>
                    <span className="font-bold text-warning">{calculateTotalRemaining()} units</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-dashed">
                    <span className="text-lg sm:text-xl font-bold text-foreground print:text-base">GRAND TOTAL:</span>
                    <span className="text-2xl sm:text-3xl font-bold text-success-green print:text-xl">₹{calculateGrandTotal().toFixed(2)}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t border-dashed text-center print:mt-6 print:pt-3">
                  <p className="text-sm font-semibold text-foreground print:text-xs">End of Day Report</p>
                  <p className="text-xs text-muted-foreground mt-1 print:text-[10px]">
                    Generated on {new Date().toLocaleString('en-IN')}
                  </p>
                </div>
              </CardContent>
            </Card>
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
            size: A4;
            margin: 15mm;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .print\\:p-4 {
            padding: 1rem !important;
          }
          
          .print\\:mb-4 {
            margin-bottom: 1rem !important;
          }
          
          .print\\:mb-2 {
            margin-bottom: 0.5rem !important;
          }
          
          .print\\:mt-2 {
            margin-top: 0.5rem !important;
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
          
          table {
            page-break-inside: auto;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default Summary;
