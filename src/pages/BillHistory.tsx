import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { mapRouteName, shouldDisplayRoute } from "@/lib/routeUtils";
import { ArrowLeft, Calendar, Printer, Package, Store } from "lucide-react";

interface SaleRow {
  id: string;
  shop_name: string;
  date: string;
  products_sold: any;
  total_amount: number;
  route_id: string;
  truck_id: string;
  created_at: string;
}

const BillHistory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [routesMap, setRoutesMap] = useState<Record<string, string>>({});
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const [filterRouteId, setFilterRouteId] = useState<string>("");
  // Keep a filtered/mapped list for rendering options, same as StartRoute style
  const [routes, setRoutes] = useState<Array<{ id: string; name: string; displayName: string }>>([]);

  // Preload stored date and route to behave same as ShopBilling/StartRoute
  useEffect(() => {
    const storedDate = localStorage.getItem("currentDate");
    const storedRoute = localStorage.getItem("currentRoute");
    if (storedDate) setSelectedDate(storedDate);
    if (storedRoute) setFilterRouteId(storedRoute);
  }, []);

  useEffect(() => {
    // Preload all active routes to map names and filter hidden ones
    const loadRoutes = async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id,name")
        .eq("is_active", true);

      if (error) {
        console.warn("Failed to load routes for mapping", error);
        return;
      }
      const filtered = (data || []).filter((r: any) => shouldDisplayRoute(r.name));
      const mapped = filtered.map((r: any) => ({ id: r.id, name: r.name, displayName: mapRouteName(r.name) }));
      setRoutes(mapped);
      const map: Record<string, string> = {};
      mapped.forEach((r) => (map[r.id] = r.displayName));
      setRoutesMap(map);
    };
    loadRoutes();
  }, []);

  useEffect(() => {
    const loadSales = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("sales")
          .select("*")
          .eq("date", selectedDate)
          .order("created_at", { ascending: true });

        if (filterRouteId) {
          query = query.eq("route_id", filterRouteId);
        }

        const { data, error } = await query;
        if (error) throw error;
        setSales((data || []) as SaleRow[]);
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Failed to load bills", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadSales();
  }, [selectedDate, filterRouteId, toast]);

  const totalBills = sales.length;
  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const getRouteName = (routeId: string) => routesMap[routeId] || "Unknown Route";

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const onPrintSelected = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent-light/10">
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
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">Bill History</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">View all bills created for a day</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filters and Stats */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-safe">
        <Card className="border-0 shadow-strong">
          <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl font-bold">Filters</CardTitle>
            <CardDescription className="text-sm sm:text-base">Choose date to see all bills (works for every route)</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Select Date
                </Label>
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm sm:text-base font-semibold">Filter by Route (optional)</Label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={filterRouteId}
                  onChange={(e) => setFilterRouteId(e.target.value)}
                >
                  <option value="">All Routes</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>{r.displayName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm sm:text-base font-semibold">Summary</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-primary-light/20 border">
                    <div className="text-xs text-muted-foreground">Bills</div>
                    <div className="text-lg font-bold text-primary">{totalBills}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-success-green-light/20 border">
                    <div className="text-xs text-muted-foreground">Revenue</div>
                    <div className="text-lg font-bold text-success-green">₹{totalRevenue.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bills List */}
            <div className="mt-4">
              {loading ? (
                <div className="text-center text-muted-foreground py-6">Loading bills...</div>
              ) : sales.length === 0 ? (
                <div className="text-center text-muted-foreground py-6">No bills found for the selected date</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:gap-4">
                  {sales.map((sale) => {
                    const items = Array.isArray(sale.products_sold) ? sale.products_sold : (sale.products_sold?.items || []);
                    const totalItems = items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);
                    return (
                      <Card key={sale.id} className="border hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm text-muted-foreground">{sale.date} · {formatTime(sale.created_at)}</div>
                              <div className="text-base font-semibold text-foreground">{sale.shop_name}</div>
                              <div className="text-xs text-muted-foreground">{getRouteName(sale.route_id)}</div>
                              <div className="text-xs text-muted-foreground">Items: {totalItems}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-success-green">₹{sale.total_amount.toFixed(2)}</div>
                              <Button variant="outline" size="sm" onClick={() => setSelectedSale(sale)}>
                                View / Print
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bill details dialog */}
        <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
          <DialogContent className="max-w-2xl print:shadow-none print:border-0 print:bg-white">
            {/* Header inside dialog - hide when printing */}
            <DialogHeader className="print:hidden">
              <DialogTitle>Bill Details</DialogTitle>
              <DialogDescription>Review and print the bill</DialogDescription>
            </DialogHeader>

            {selectedSale && (
              <div className="space-y-4">
                {/* Top info and actions - hide on print */}
                <div className="flex items-center justify-between mb-3 print:hidden">
                  <div>
                    <div className="text-sm text-muted-foreground">{selectedSale.date} · {formatTime(selectedSale.created_at)}</div>
                    <div className="text-base font-semibold">{selectedSale.shop_name}</div>
                    <div className="text-xs text-muted-foreground">{getRouteName(selectedSale.route_id)}</div>
                  </div>
                  <Button variant="outline" onClick={onPrintSelected}>
                    <Printer className="w-4 h-4 mr-2" /> Print
                  </Button>
                </div>

                {/* Printable Bill — same layout as ShopBilling */}
                <div className="receipt print:p-0 print:bg-white print:text-black print:font-mono print:w-[58mm] print:mx-0">
                  <Card className="border-0 shadow-strong print:shadow-none print:border-0">
                    <CardContent className="p-6 sm:p-8 print:p-2">
                      {/* Bill Header */}
                      <div className="text-center mb-6 print:mb-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground print:text-lg">BHAVYA ENTERPRICE</h1>
                        <p className="text-sm font-semibold text-foreground print:text-[10px]">Sales Invoice</p>
                        {/* Address */}
                        <div className="mt-1 text-xs text-foreground print:text-[10px]">
                          <p className="leading-tight">Near Bala petrol pump</p>
                          <p className="leading-tight">Jambusar Bharuch road</p>
                        </div>
                        {/* Phone and GSTIN */}
                        <div className="mt-2 text-xs text-foreground print:text-[10px]">
                          <p className="leading-tight">Phone no.: 8866756059</p>
                          <p className="leading-tight">GSTIN: 24EVVPS8220P1ZF</p>
                        </div>
                        {/* Date/Time and Route */}
                        <div className="mt-2 text-xs text-foreground print:text-[10px]">
                          <p className="leading-tight">Date: {new Date(selectedSale.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</p>
                          <p className="font-semibold text-primary">Route: {getRouteName(selectedSale.route_id)}</p>
                        </div>
                      </div>

                      {/* Shop Details */}
                      <div className="mb-6 print:mb-3 pb-3 border-t border-b border-dashed">
                        <div className="flex items-center gap-2 mb-1">
                          <Store className="w-5 h-5 text-primary print:w-4 print:h-4" />
                          <span className="font-semibold text-foreground print:text-[11px]">Shop:</span>
                        </div>
                        <p className="text-lg font-bold text-foreground pl-7 print:text-sm">{selectedSale.shop_name}</p>
                        {!Array.isArray(selectedSale.products_sold) && selectedSale.products_sold?.shop_address && (
                          <p className="text-xs text-muted-foreground pl-7 mt-1 print:text-[10px]">Address/Village: {selectedSale.products_sold.shop_address}</p>
                        )}
                        {!Array.isArray(selectedSale.products_sold) && selectedSale.products_sold?.shop_phone && (
                          <p className="text-xs text-muted-foreground pl-7 print:text-[10px]">Phone: {selectedSale.products_sold.shop_phone}</p>
                        )}
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
                            {(Array.isArray(selectedSale.products_sold) ? selectedSale.products_sold : (selectedSale.products_sold?.items || [])).map((item: any, index: number) => (
                              <tr key={index} className="border-b border-border">
                                <td className="py-3 text-foreground print:text-[11px] print:py-1">{item.productName || item.name}</td>
                                <td className="py-3 text-center text-foreground print:text-[11px] print:py-1">{item.quantity} {item.unit === 'box' ? 'Box' : item.unit === 'pcs' ? 'pcs' : ''}</td>
                                <td className="py-3 text-right text-foreground print:text-[11px] print:py-1">₹{(item.price ?? 0).toFixed(2)}</td>
                                <td className="py-3 text-right font-semibold text-foreground print:text-[11px] print:py-1">₹{(item.total ?? (item.quantity * (item.price ?? 0))).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Total Section */}
                      <div className="border-t border-foreground border-dashed pt-3 print:pt-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-lg font-bold text-foreground print:text-sm">TOTAL:</span>
                          <span className="text-2xl font-bold text-primary print:text-base">₹{selectedSale.total_amount.toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground text-right print:text-[10px]">
                          Items: {(Array.isArray(selectedSale.products_sold) ? selectedSale.products_sold : (selectedSale.products_sold?.items || [])).reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)}
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
          </DialogContent>
        </Dialog>
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

          /* Set page size for 58mm roll printer */
          @page {
            size: 58mm auto;
            margin: 0mm;
          }

          .receipt {
            width: 58mm !important;
            margin: 0 !important;
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

export default BillHistory;