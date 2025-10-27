import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // ADDED: Import createPortal
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "../integrations/supabase/client"; // FIXED: Corrected import path
import { mapRouteName } from "../lib/routeUtils"; // FIXED: Corrected import path
import { listenForProductUpdates } from "../lib/productSync"; // FIXED: Corrected import path
import { seedDefaultProductsIfMissing, UNIT_PRICE_MAP } from "../lib/defaultProducts"; // FIXED: Corrected import path
import { ArrowLeft, ShoppingCart, Plus, Minus, Printer, Store, Check, RefreshCw, X, MapPin, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { nameMatchesQueryByWordPrefix } from "../lib/utils"; // FIXED: Corrected import path

interface Product {
  id: string;
  name: string;
  price: number;
  pcs_price?: number;
  box_price?: number;
}

interface SaleItem {
  productId: string;
  productName: string;
  unit: 'box' | 'pcs';
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
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  // Shop name suggestions state
  const [shopSuggestions, setShopSuggestions] = useState<string[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Add-product dialog state
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [unitMode, setUnitMode] = useState<'pcs' | 'box'>('box');
  const [tempQuantity, setTempQuantity] = useState<number>(0);
  const [itemUnitModes, setItemUnitModes] = useState<Record<string, 'pcs' | 'box'>>({});

  // Defer cleanup until the print dialog completes to avoid blank PDFs/prints
  useEffect(() => {
    const handleAfterPrint = () => {
      // Reset form and refresh stock only after printing is done
      setShopName("");
      setShopAddress("");
      setShopPhone("");
      setShowBill(false);
      // Refresh stock to get updated available quantities
      if (currentRoute && currentDate) {
        fetchProductsAndStock(currentRoute, currentDate);
      }
      setLoading(false);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [currentRoute, currentDate]);

  // Global shop details cache (address/phone) helpers
  const getDetailsKey = (_routeId?: string) => `shopDetails:global`;
  const saveShopDetailsToLocal = (routeId: string, name: string, address?: string, phone?: string) => {
    if (!name) return;
    const key = getDetailsKey(routeId);
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    const map = existing && typeof existing === 'object' ? existing : {};
    map[name] = { address: address || '', phone: phone || '' };
    localStorage.setItem(key, JSON.stringify(map));
  };
  const getShopDetailsFromLocal = (routeId: string, name: string): { address?: string; phone?: string } | undefined => {
    if (!name) return undefined;
    const key = getDetailsKey(routeId);
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    const map = existing && typeof existing === 'object' ? existing : {};
    return map[name];
  };

  // Load previously used shop names (local + remote) for suggestions
  const loadShopSuggestions = async (routeId: string) => {
    try {
      const localKey = `shopNames:${routeId}`;
      const hiddenKey = `shopNames:hidden:${routeId}`;
      const local = JSON.parse(localStorage.getItem(localKey) || '[]');
      const hidden = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
      const namesSet = new Set<string>(Array.isArray(local) ? local : []);
      const hiddenSet = new Set<string>(Array.isArray(hidden) ? hidden : []);
      const detailsKey = getDetailsKey(routeId);
      const existingDetails = JSON.parse(localStorage.getItem(detailsKey) || '{}');
      const detailsMap: Record<string, { address?: string; phone?: string }> = existingDetails && typeof existingDetails === 'object' ? existingDetails : {};

      // Fetch shop names from sales table for this route
      const { data, error } = await supabase
        .from("sales")
        .select("shop_name, products_sold")
        .eq("route_id", routeId);

      if (!error && data) {
        data.forEach((row: any) => {
          const name = (row.shop_name || '').trim();
          if (name && !hiddenSet.has(name)) namesSet.add(name);
          // Try capture address/phone from products_sold (object shape)
          const ps = row.products_sold;
          if (ps && !Array.isArray(ps)) {
            const addr = ps.shop_address || '';
            const ph = ps.shop_phone || '';
            if ((addr || ph) && !hiddenSet.has(name)) {
              if (!detailsMap[name]) detailsMap[name] = {};
              if (addr) detailsMap[name].address = addr;
              if (ph) detailsMap[name].phone = ph;
            }
          }
        });
      }

      const names = Array.from(namesSet).filter(n => !hiddenSet.has(n)).sort((a, b) => a.localeCompare(b));
      setShopSuggestions(names);
      localStorage.setItem(localKey, JSON.stringify(names));
      localStorage.setItem(detailsKey, JSON.stringify(detailsMap));
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

      // Ensure default products exist
      await seedDefaultProductsIfMissing();

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

      // Calculate remaining stock per unit for each product
      const saleItemsWithStock = productsData.flatMap(product => {
        // Get initial stock per unit
        let initialBox = 0;
        let initialPcs = 0;
        if (stockData && stockData.stock) {
          const stockItems = stockData.stock as any[];
          const boxStock = stockItems.find((s: any) => s.productId === product.id && s.unit === 'box');
          const pcsStock = stockItems.find((s: any) => s.productId === product.id && (s.unit === 'pcs' || !('unit' in s)));
          initialBox = boxStock?.quantity || 0;
          initialPcs = pcsStock?.quantity || 0;
        }

        // Calculate total sold in PCS across units
        let soldTotalPCS = 0;
        if (salesData) {
          salesData.forEach(sale => {
            if (sale.products_sold) {
              const items = Array.isArray(sale.products_sold)
                ? (sale.products_sold as any[])
                : (Array.isArray((sale.products_sold as any)?.items) ? (sale.products_sold as any).items : []);
              items.forEach((p: any) => {
                if (p.productId === product.id) {
                  const u = (p.unit || 'pcs');
                  const q = p.quantity || 0;
                  soldTotalPCS += u === 'box' ? (q * 24) : q;
                }
              });
            }
          });
        }

        const initialTotalPCS = (initialBox * 24) + initialPcs;
        const remainingTotalPCS = Math.max(0, initialTotalPCS - soldTotalPCS);
        const availableBox = Math.floor(remainingTotalPCS / 24);
        const availablePcs = remainingTotalPCS % 24;

        return [
          {
            productId: product.id,
            productName: product.name,
            unit: 'box' as const,
            quantity: 0,
            price: (product as any).box_price ?? UNIT_PRICE_MAP[product.name.trim().toLowerCase()]?.box ?? product.price,
            total: 0,
            availableStock: availableBox,
          },
          {
            productId: product.id,
            productName: product.name,
            unit: 'pcs' as const,
            quantity: 0,
            price: ((product as any).pcs_price ?? UNIT_PRICE_MAP[product.name.trim().toLowerCase()]?.pcs ?? (((product as any).box_price ?? product.price) / 24)),
            total: 0,
            availableStock: availablePcs,
          }
        ];
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

  const updateQuantity = (productId: string, unit: 'box' | 'pcs', change: number) => {
    setSaleItems(prev => {
      const boxItem = prev.find(i => i.productId === productId && i.unit === 'box');
      const pcsItem = prev.find(i => i.productId === productId && i.unit === 'pcs');
      const totalRemainPCS = (boxItem?.availableStock || 0) * 24 + (pcsItem?.availableStock || 0);
      const otherQty = unit === 'box' ? (pcsItem?.quantity || 0) : (boxItem?.quantity || 0);
      const maxAllowed = unit === 'box'
        ? Math.max(0, Math.floor((totalRemainPCS - otherQty) / 24))
        : Math.max(0, totalRemainPCS - (otherQty * 24));

      return prev.map(item => {
        if (item.productId === productId && item.unit === unit) {
          const desired = item.quantity + change;
          const newQuantity = Math.max(0, Math.min(maxAllowed, desired));
          return {
            ...item,
            quantity: newQuantity,
            total: newQuantity * item.price,
          };
        }
        return item;
      });
    });
  };

  const setQuantityDirect = (productId: string, unit: 'box' | 'pcs', quantity: number) => {
    setSaleItems(prev => {
      const boxItem = prev.find(i => i.productId === productId && i.unit === 'box');
      const pcsItem = prev.find(i => i.productId === productId && i.unit === 'pcs');
      const totalRemainPCS = (boxItem?.availableStock || 0) * 24 + (pcsItem?.availableStock || 0);
      const otherQty = unit === 'box' ? (pcsItem?.quantity || 0) : (boxItem?.quantity || 0);
      const maxAllowed = unit === 'box'
        ? Math.max(0, Math.floor((totalRemainPCS - otherQty) / 24))
        : Math.max(0, totalRemainPCS - (otherQty * 24));

      return prev.map(item => {
        if (item.productId === productId && item.unit === unit) {
          const desired = quantity;
          const newQuantity = Math.max(0, Math.min(maxAllowed, desired));
          return {
            ...item,
            quantity: newQuantity,
            total: newQuantity * item.price,
          };
        }
        return item;
      });
    });
  };

  const updatePrice = (productId: string, unit: 'box' | 'pcs', newPrice: number) => {
    setSaleItems(prev =>
      prev.map(item => {
        if (item.productId === productId && item.unit === unit) {
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

  // Quick-add dialog helpers
  const resetAddProductState = () => {
    setProductQuery("");
    setSelectedProduct(null);
    setUnitMode('box');
    setTempQuantity(0);
  };

  const toggleUnitMode = () => {
    setUnitMode((prev) => {
      const next = prev === 'box' ? 'pcs' : 'box';
      if (next === 'pcs' && tempQuantity === 0) {
        setTempQuantity(1);
      }
      return next;
    });
  };

  const adjustTempQuantity = (delta: number) => {
    setTempQuantity((q) => {
      const step = 1;
      let next = q + delta * step;
      if (selectedProduct) {
        const si = saleItems.find((i) => i.productId === selectedProduct.id && i.unit === unitMode);
        const max = si ? si.availableStock : Infinity;
        next = Math.max(0, Math.min(max, next));
      } else {
        next = Math.max(0, next);
      }
      return next;
    });
  };

  const handleAddProductToSale = () => {
    if (!selectedProduct) return;
    const pid = selectedProduct.id;
    const target = saleItems.find((item) => item.productId === pid && item.unit === unitMode);
    const maxAvail = target ? target.availableStock : 0;
    const desired = Math.max(0, tempQuantity);
    const finalQty = Math.min(desired, maxAvail);

    setSaleItems((prev) =>
      prev.map((item) => {
        if (item.productId === pid && item.unit === unitMode) {
          const newQty = finalQty;
          return {
            ...item,
            quantity: newQty,
            total: newQty * item.price,
          };
        }
        return item;
      })
    );
    setShowAddProductDialog(false);
    resetAddProductState();
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
      // Prepare sale data synchronously first
      const mockUserId = "00000000-0000-0000-0000-000000000000";
      const soldItems = getSoldItems();

      const saleData = {
        auth_user_id: mockUserId,
        shop_name: shopName,
        date: currentDate,
        products_sold: {
          items: soldItems.map(item => ({
            productId: item.productId,
            productName: item.productName,
            unit: item.unit,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
          })),
          shop_address: shopAddress,
          shop_phone: shopPhone,
        },
        total_amount: calculateTotal(),
        route_id: currentRoute,
        truck_id: "00000000-0000-0000-0000-000000000000", // Placeholder for truck
      };

      // Trigger print synchronously within user gesture
      window.print();

      // Save sale to database without blocking the print dialog
      const { error } = await supabase.from("sales").insert(saleData);
      if (error) {
        throw error;
      }

      // Save shop name to local suggestions for quick reuse
      if (currentRoute && shopName.trim()) {
        saveShopNameToLocal(currentRoute, shopName.trim());
        // Persist address/phone so they auto-fill next time for this shop
        saveShopDetailsToLocal(
          currentRoute,
          shopName.trim(),
          (shopAddress || '').trim(),
          (shopPhone || '').trim()
        );
      }

      toast({
        title: "Success!",
        description: "Bill printed and sale recorded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save sale",
        variant: "destructive",
      });
    } finally {
      // Loading state will be cleared in afterprint to avoid racing the print dialog
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
                          // Auto-fill address/phone if typed name exactly matches a suggestion
                          const exact = shopSuggestions.find(n => n.toLowerCase() === value.trim().toLowerCase());
                          if (exact && currentRoute) {
                            const details = getShopDetailsFromLocal(currentRoute, exact);
                            if (details) {
                              if (typeof details.address === 'string') setShopAddress(details.address);
                              if (typeof details.phone === 'string') setShopPhone(details.phone);
                            }
                          }
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
                              // Auto-populate address/phone from saved details for this route
                              if (currentRoute) {
                                const details = getShopDetailsFromLocal(currentRoute, name);
                                if (details) {
                                  if (typeof details.address === 'string') setShopAddress(details.address);
                                  if (typeof details.phone === 'string') setShopPhone(details.phone);
                                }
                              }
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

                {/* Address / Village */}
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Address / Village
                  </Label>
                  <Input
                    type="text"
                    placeholder="Enter address or village name"
                    value={shopAddress}
                    onChange={(e) => setShopAddress(e.target.value)}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="Enter phone number"
                    value={shopPhone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9+\-\s]/g, "");
                      setShopPhone(val);
                    }}
                    className="h-11 sm:h-10 text-base"
                  />
                </div>

                {/* Products Selection */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base sm:text-lg font-semibold flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                      Select Products
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        Items: <span className="font-semibold text-primary">{soldItemsCount}</span>
                      </div>
                      <Button variant="default" size="sm" onClick={() => setShowAddProductDialog(true)} className="h-9" title="Quick add product">
                        Add Product
                      </Button>
                    </div>
                  </div>

                  {/* Quick Add Product */}
                  <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Product</DialogTitle>
                        <DialogDescription>Search and quickly add a product with unit mode.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Search Product</Label>
                          <Input
                            autoFocus
                            placeholder="Type word start to search"
                            value={productQuery}
                            onChange={(e) => {
                              const q = e.target.value;
                              setProductQuery(q);
                              const matchList = products
                                .filter(p => nameMatchesQueryByWordPrefix(p.name, q))
                                .filter(p => {
                                  const boxItem = saleItems.find(s => s.productId === p.id && s.unit === 'box');
                                  const pcsItem = saleItems.find(s => s.productId === p.id && s.unit === 'pcs');
                                  const totalAvail = (boxItem?.availableStock || 0) + (pcsItem?.availableStock || 0);
                                  return totalAvail > 0;
                                });
                              const firstMatch = matchList[0];
                              setSelectedProduct(firstMatch || null);
                              if (!firstMatch) {
                                setTempQuantity(0);
                              }
                            }}
                            className="h-10"
                          />
                          <div className="max-h-40 overflow-y-auto border rounded-md">
                            {products
                              .filter(p => nameMatchesQueryByWordPrefix(p.name, productQuery))
                              .filter(p => {
                                const boxItem = saleItems.find(s => s.productId === p.id && s.unit === 'box');
                                const pcsItem = saleItems.find(s => s.productId === p.id && s.unit === 'pcs');
                                const totalAvail = (boxItem?.availableStock || 0) + (pcsItem?.availableStock || 0);
                                return totalAvail > 0;
                              })
                              .slice(0, 20)
                              .map(p => {
                                 const boxItem = saleItems.find(s => s.productId === p.id && s.unit === 'box');
                                 const pcsItem = saleItems.find(s => s.productId === p.id && s.unit === 'pcs');
                                 const boxAvail = boxItem?.availableStock || 0;
                                 const pcsAvail = pcsItem?.availableStock || 0;
                                 return (
                                   <button
                                     key={p.id}
                                     type="button"
                                     onClick={() => setSelectedProduct(p)}
                                     className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted ${selectedProduct?.id === p.id ? 'bg-muted/60' : ''}`}
                                   >
                                     <span className="text-sm">{p.name}</span>
                                     <span className="text-xs text-muted-foreground">Avail: {boxAvail} Box, {pcsAvail} pcs</span>
                                   </button>
                                 );
                               })}
                            {productQuery && products
                                 .filter(p => nameMatchesQueryByWordPrefix(p.name, productQuery))
                                .filter(p => {
                                  const boxItem = saleItems.find(s => s.productId === p.id && s.unit === 'box');
                                  const pcsItem = saleItems.find(s => s.productId === p.id && s.unit === 'pcs');
                                  const totalAvail = (boxItem?.availableStock || 0) + (pcsItem?.availableStock || 0);
                                  return totalAvail > 0;
                                }).length === 0 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                            )}
                          </div>
                        </div>

                        {selectedProduct && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">{selectedProduct.name}</div>
                              <div className="text-xs text-muted-foreground">
                                 {(() => {
                                   const boxItem = saleItems.find(i => i.productId === selectedProduct.id && i.unit === 'box');
                                   const pcsItem = saleItems.find(i => i.productId === selectedProduct.id && i.unit === 'pcs');
                                   const boxAvail = boxItem?.availableStock ?? 0;
                                   const pcsAvail = pcsItem?.availableStock ?? 0;
                                   return <>Avail: {boxAvail} Box, {pcsAvail} pcs</>;
                                 })()}
                               </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={toggleUnitMode}>
                                {unitMode === 'pcs' ? 'pcs' : 'Box'}
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                Step: 1
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="icon" onClick={() => adjustTempQuantity(-1)} className="h-9 w-9">
                                <Minus className="w-4 h-4" />
                              </Button>
                              <Input
                                type="number"
                                value={tempQuantity}
                                onChange={(e) => {
                                  const raw = parseInt(e.target.value) || 0;
                                  const si = saleItems.find(i => i.productId === selectedProduct.id && i.unit === unitMode);
                                  const max = si?.availableStock ?? 0;
                                  setTempQuantity(Math.max(0, Math.min(max, raw)));
                                }}
                                className="w-20 text-center h-9"
                                inputMode="numeric"
                                min="0"
                              />
                              <Button type="button" variant="outline" size="icon" onClick={() => adjustTempQuantity(1)} className="h-9 w-9">
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter className="sm:justify-end">
                        <Button variant="ghost" onClick={() => { setShowAddProductDialog(false); resetAddProductState(); }}>
                          Cancel
                        </Button>
                        <Button onClick={handleAddProductToSale} disabled={!selectedProduct || tempQuantity <= 0}>
                          Add
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Quick Edit - Added Items */}
                  <div className="space-y-2">
                    {saleItems.filter(i => i.quantity > 0).length > 0 && (
                      <div className="rounded-md border p-3">
                        <div className="text-sm font-semibold mb-2">Added Items</div>
                        <div className="space-y-2">
                          {saleItems.filter(i => i.quantity > 0).map(i => (
                            <div key={`${i.productId}-${i.unit}`} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{i.productName}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                  {i.unit === 'pcs' ? 'pcs' : 'Box'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" size="icon" onClick={() => updateQuantity(i.productId, i.unit, -1)} className="h-8 w-8">
                                  <Minus className="w-4 h-4" />
                                </Button>
                                <Input
                                  type="number"
                                  value={i.quantity}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setQuantityDirect(i.productId, i.unit, val);
                                  }}
                                  className="w-16 text-center h-8"
                                  min="0"
                                  max={i.availableStock}
                                />
                                <Button type="button" variant="outline" size="icon" onClick={() => updateQuantity(i.productId, i.unit, 1)} className="h-8 w-8">
                                  <Plus className="w-4 h-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setQuantityDirect(i.productId, i.unit, 0);
                                  }}
                                  className="h-8 w-8"
                                  title="Remove"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:gap-4">
                    {(
                      // Show only products with available stock across units
                      products
                        .map((prod, idx) => {
                          const boxItem = saleItems.find(s => s.productId === prod.id && s.unit === 'box');
                          const pcsItem = saleItems.find(s => s.productId === prod.id && s.unit === 'pcs');
                          const avail = (boxItem?.availableStock || 0) + (pcsItem?.availableStock || 0);
                          return { prod, idx, avail };
                        })
                        .filter(item => item.avail > 0)
                        .map(x => x.prod)
                    ).map((product) => {
                      const boxItem = saleItems.find(s => s.productId === product.id && s.unit === 'box');
                      const pcsItem = saleItems.find(s => s.productId === product.id && s.unit === 'pcs');
                      const boxAvail = boxItem?.availableStock || 0;
                      const pcsAvail = pcsItem?.availableStock || 0;
                      const boxQty = boxItem?.quantity || 0;
                      const pcsQty = pcsItem?.quantity || 0;
                      const boxPrice = boxItem?.price ?? (product.box_price ?? product.price);
                      const pcsPrice = pcsItem?.price ?? (product.pcs_price ?? ((product.box_price ?? product.price ?? 0) / 24));
                      const availableStock = boxAvail + pcsAvail;
                      const lineTotal = (boxItem?.total || 0) + (pcsItem?.total || 0);

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
                                {/* Box Unit Row */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">Unit: Box</span>
                                    <span className="text-xs text-muted-foreground">Avail: {boxAvail} Box</span>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium text-muted-foreground">Price (₹)</Label>
                                    <Input
                                      type="number"
                                      value={boxPrice}
                                      onChange={(e) => {
                                        const newPrice = parseFloat(e.target.value) || product.price;
                                        updatePrice(product.id, 'box', newPrice);
                                      }}
                                      className="h-9 text-sm"
                                      min="1"
                                      step="0.01"
                                      disabled={boxAvail === 0}
                                      placeholder={`${product.box_price ?? product.price}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium text-muted-foreground">Quantity (Box)</Label>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => updateQuantity(product.id, 'box', -1)}
                                        disabled={boxQty === 0}
                                        className="h-9 w-9"
                                      >
                                        <Minus className="w-4 h-4" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={boxQty}
                                        onChange={(e) => {
                                          const newQuantity = Math.max(0, parseInt(e.target.value) || 0);
                                          setQuantityDirect(product.id, 'box', newQuantity);
                                        }}
                                        max={boxAvail}
                                        className="w-16 text-center text-sm h-9"
                                        min="0"
                                        inputMode="numeric"
                                        disabled={boxAvail === 0}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => updateQuantity(product.id, 'box', 1)}
                                        disabled={boxQty >= boxAvail || boxAvail === 0}
                                        className="h-9 w-9"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {/* Pcs Unit Row */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">Unit: 1 pcs</span>
                                    <span className="text-xs text-muted-foreground">Avail: {pcsAvail} pcs</span>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium text-muted-foreground">Price (₹)</Label>
                                    <Input
                                      type="number"
                                      value={pcsPrice}
                                      onChange={(e) => {
                                        const newPrice = parseFloat(e.target.value) || product.price;
                                        updatePrice(product.id, 'pcs', newPrice);
                                      }}
                                      className="h-9 text-sm"
                                      min="1"
                                      step="0.01"
                                      disabled={pcsAvail === 0}
                                      placeholder={`${product.pcs_price ?? ((product.box_price ?? product.price) / 24)}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium text-muted-foreground">Quantity (pcs)</Label>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => updateQuantity(product.id, 'pcs', -1)}
                                        disabled={pcsQty === 0}
                                        className="h-9 w-9"
                                      >
                                        <Minus className="w-4 h-4" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={pcsQty}
                                        onChange={(e) => {
                                          const newQuantity = Math.max(0, parseInt(e.target.value) || 0);
                                          setQuantityDirect(product.id, 'pcs', newQuantity);
                                        }}
                                        max={pcsAvail}
                                        className="w-16 text-center text-sm h-9"
                                        min="0"
                                        inputMode="numeric"
                                        disabled={pcsAvail === 0}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => updateQuantity(product.id, 'pcs', 1)}
                                        disabled={pcsQty >= pcsAvail || pcsAvail === 0}
                                        className="h-9 w-9"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Stock and Total Info */}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-warning">
                                    Available: {boxAvail} Box, {pcsAvail} pcs
                                  </p>
                                </div>
                                {(boxQty + pcsQty) > 0 && (
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-success-green">
                                      Line Total: ₹{lineTotal.toFixed(2)}
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
                <div className="sticky bottom-3 sm:static bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none p-1 sm:p-0 -mx-2 sm:mx-0 rounded-md sm:rounded-none">
                  <Button
                    onClick={handleGenerateBill}
                    variant="success"
                    size="default"
                    className="w-full h-10 sm:h-11 text-sm sm:text-base font-semibold touch-manipulation shadow sm:shadow-none"
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
          <>
            {/* On-screen preview card */}
            <div className="space-y-4">
              <Card className="border-0 shadow-strong print:hidden">
                <CardHeader className="text-center pb-4 px-4 sm:px-6">
                  <CardTitle className="text-xl sm:text-2xl font-bold text-success-green">Bill Generated!</CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Review and print the bill
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-4 sm:px-6 space-y-4">
                  <div className="sticky bottom-3 sm:static bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none p-1 sm:p-0 -mx-2 sm:mx-0 rounded-md sm:rounded-none">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <Button
                        onClick={handlePrintBill}
                        variant="success"
                        size="default"
                        className="flex-1 h-10 sm:h-11 text-sm sm:text-base font-semibold touch-manipulation w-full sm:w-auto shadow sm:shadow-none"
                        disabled={loading}
                      >
                        <Printer className="w-5 h-5 mr-2" />
                        {loading ? "Printing..." : "Print Bill"}
                      </Button>
                      <Button
                        onClick={() => window.print()}
                        variant="outline"
                        size="default"
                        className="flex-1 h-10 sm:h-11 text-sm sm:text-base font-semibold touch-manipulation w-full sm:w-auto shadow sm:shadow-none"
                      >
                        <Printer className="w-5 h-5 mr-2" />
                        Download Bill
                      </Button>
                      <Button
                        onClick={handleBackToForm}
                        variant="outline"
                        size="default"
                        className="h-10 sm:h-11 px-4 sm:px-6 touch-manipulation w-full sm:w-auto shadow sm:shadow-none"
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Preview version of bill for screen (not for printing) */}
              <Card className="border-0 shadow-strong print:hidden">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="text-center">
                      <h2 className="text-xl font-bold">BHAVYA ENTERPRICE</h2>
                      <p className="text-sm">Sales Invoice</p>
                    </div>
                    <div className="border-t pt-4">
                      <p className="font-semibold">Shop: {shopName}</p>
                      {shopAddress && <p className="text-sm text-muted-foreground">Address: {shopAddress}</p>}
                      {shopPhone && <p className="text-sm text-muted-foreground">Phone: {shopPhone}</p>}
                    </div>
                    <div className="border-t pt-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Item</th>
                            <th className="text-center py-2">Qty</th>
                            <th className="text-right py-2">Rate</th>
                            <th className="text-right py-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getSoldItems().map((item, index) => (
                            <tr key={`${item.productId}-${item.unit}-${index}`} className="border-b">
                              <td className="py-2">{item.productName}</td>
                              <td className="text-center py-2">{item.quantity} {item.unit === 'box' ? 'Box' : 'pcs'}</td>
                              <td className="text-right py-2">₹{item.price.toFixed(2)}</td>
                              <td className="text-right py-2 font-semibold">₹{item.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold">TOTAL:</span>
                        <span className="text-2xl font-bold text-success-green">₹{totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Portal: Render print-only receipt at document body level */}
            {createPortal(
              <div id="print-receipt-container" style={{ display: 'none' }}>
                <div className="receipt-58mm">
                  {/* Bill Header */}
                  <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                    <h1 style={{ margin: '0', fontSize: '14px', fontWeight: 'bold' }}>BHAVYA ENTERPRICE</h1>
                    <p style={{ margin: '0', fontSize: '10px', fontWeight: '600' }}>Sales Invoice</p>
                    {/* Address */}
                    <div style={{ marginTop: '2px', fontSize: '8px' }}>
                      <p style={{ margin: '0', lineHeight: '1.1' }}>Near Bala petrol pump</p>
                      <p style={{ margin: '0', lineHeight: '1.1' }}>Jambusar Bharuch road</p>
                    </div>
                    {/* Phone and GSTIN */}
                    <div style={{ marginTop: '2px', fontSize: '8px' }}>
                      <p style={{ margin: '0', lineHeight: '1.1' }}>Phone: 8866756059</p>
                      <p style={{ margin: '0', lineHeight: '1.1' }}>GSTIN: 24EVVPS8220P1ZF</p>
                    </div>
                    {/* Date/Time */}
                    <div style={{ marginTop: '2px', fontSize: '8px' }}>
                      <p style={{ margin: '0' }}>Date: {new Date().toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}</p>
                      {currentRouteName && (
                        <p style={{ margin: '0', fontWeight: 'bold' }}>Route: {currentRouteName}</p>
                      )}
                    </div>
                  </div>

                  {/* Shop Details */}
                  <div style={{ marginBottom: '4px', paddingBottom: '2px', borderTop: '1px dashed black', borderBottom: '1px dashed black', paddingTop: '2px' }}>
                    <p style={{ fontSize: '9px', fontWeight: '600', margin: '0' }}>Shop: {shopName}</p>
                    {shopAddress && (
                      <p style={{ fontSize: '8px', margin: '0' }}>Addr: {shopAddress}</p>
                    )}
                    {shopPhone && (
                      <p style={{ fontSize: '8px', margin: '0' }}>Ph: {shopPhone}</p>
                    )}
                  </div>

                  {/* Products Table */}
                  <div style={{ marginBottom: '4px' }}>
                    <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px dashed black' }}>
                          <th style={{ textAlign: 'left', padding: '1px 0', fontSize: '8px' }}>Item</th>
                          <th style={{ textAlign: 'center', padding: '1px 0', fontSize: '8px' }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '1px 0', fontSize: '8px' }}>Rate</th>
                          <th style={{ textAlign: 'right', padding: '1px 0', fontSize: '8px' }}>Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSoldItems().map((item, index) => (
                          <tr key={`${item.productId}-${item.unit}-${index}`}>
                            <td style={{ padding: '1px 0', fontSize: '8px' }}>{item.productName}</td>
                            <td style={{ padding: '1px 0', textAlign: 'center', fontSize: '8px' }}>
                              {item.quantity} {item.unit === 'box' ? 'Box' : 'pcs'}
                            </td>
                            <td style={{ padding: '1px 0', textAlign: 'right', fontSize: '8px' }}>₹{item.price.toFixed(2)}</td>
                            <td style={{ padding: '1px 0', textAlign: 'right', fontSize: '8px', fontWeight: '600' }}>
                              ₹{item.total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Section */}
                  <div style={{ borderTop: '1px dashed black', paddingTop: '2px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold' }}>TOTAL:</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold' }}>₹{totalAmount.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: '8px', textAlign: 'right' }}>
                      Items: {soldItemsCount}
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ marginTop: '4px', paddingTop: '2px', borderTop: '1px dashed black', textAlign: 'center' }}>
                    <p style={{ fontSize: '9px', fontWeight: '600', margin: '0' }}>Thank you for your business!</p>
                    <p style={{ fontSize: '8px', margin: '0' }}>Have a great day!</p>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </>
        )}
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          /* Set page size for 80mm roll printer */
          @page {
            size: 80mm auto;
            margin: 3mm;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #fff !important;
            width: 80mm !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide all body children except our print container */
          body > *:not(#print-receipt-container) {
            display: none !important;
          }

          /* Show the print container */
          #print-receipt-container {
            display: block !important;
            position: relative !important;
            width: 72mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: white !important;
          }

          .print\\:hidden {
            display: none !important;
          }

          /* Receipt styling for receipt */
          .receipt-58mm {
            display: block !important;
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            background: white !important;
            color: black !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
            font-size: 10px !important;
            line-height: 1.2 !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }

          .receipt-58mm * {
            color: black !important;
            border-color: black !important;
          }

          .receipt-58mm h1 {
            font-size: 14px !important;
            font-weight: bold !important;
            margin: 2px 0 !important;
            text-align: center !important;
          }

          .receipt-58mm table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 2px 0 !important;
          }

          .receipt-58mm th,
          .receipt-58mm td {
            padding: 1px 2px !important;
            font-size: 10px !important;
          }

          .receipt-58mm th {
            font-weight: bold !important;
            border-bottom: 1px dashed black !important;
          }

          /* Remove all shadows and rounded corners */
          .receipt-58mm * {
            box-shadow: none !important;
            border-radius: 0 !important;
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
        }
      `}</style>
    </div>
  );
};

export default ShopBilling;

