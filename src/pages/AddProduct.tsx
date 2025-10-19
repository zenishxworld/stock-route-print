import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { notifyProductUpdate, notifyProductDelete } from "@/lib/productSync";
import { ArrowLeft, Plus, Edit2, Trash2, Package, Save, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Product {
  id: string;
  name: string;
  price: number;
  pcs_price?: number;
  box_price?: number;
  description: string | null;
  status: string | null;
  created_at: string;
}

const AddProduct = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [boxPrice, setBoxPrice] = useState("");
  const [pcsPrice, setPcsPrice] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setProducts(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setName("");
    setBoxPrice("");
    setPcsPrice("");
    setDescription("");
    setEditingId(null);
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    const baseBox = product.box_price ?? product.price;
    const basePcs = product.pcs_price ?? (baseBox ? baseBox / 24 : 0);
    setBoxPrice((baseBox || 0).toString());
    setPcsPrice(basePcs ? basePcs.toFixed(2) : "");
    setDescription(product.description || "");
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const boxValue = parseFloat(boxPrice);
      if (!Number.isFinite(boxValue) || boxValue <= 0) {
        toast({
          title: "Invalid Box Price",
          description: "Please enter a valid box price greater than 0",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const pcsValue = parseFloat((boxValue / 24).toFixed(2));

      const productData = {
        name: name.trim(),
        price: boxValue,
        pcs_price: pcsValue,
        box_price: boxValue,
        description: description.trim() || null,
        status: "active",
      };

      if (editingId) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingId);

        if (error) throw error;

        console.log('AddProduct: Notifying about product update', editingId, productData);
        notifyProductUpdate(editingId, productData);

        toast({
          title: "Product Updated!",
          description: `${name} has been updated successfully`,
        });
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(productData)
          .select()
          .single();

        if (error) throw error;

        console.log('AddProduct: Notifying about new product', data.id, productData);
        notifyProductUpdate(data.id, productData);

        toast({
          title: "Product Added!",
          description: `${name} has been added successfully`,
        });
      }

      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      // Notify other pages about the deletion
      notifyProductDelete(deleteId);

      toast({
        title: "Product Deleted",
        description: "Product has been removed successfully",
      });

      fetchProducts();
      setDeleteId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const activeProducts = products.filter(p => p.status === "active");
  const inactiveProducts = products.filter(p => p.status !== "active");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-warning-light/10">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-9 w-9 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-r from-warning to-warning/80 rounded-lg sm:rounded-xl flex items-center justify-center">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-foreground">Manage Products</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">Add or edit products</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-safe">
        {/* Add/Edit Product Form */}
        <Card className="border-0 shadow-strong mb-6">
          <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
            <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit2 className="w-5 h-5" />
                  Edit Product
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Add New Product
                </>
              )}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {editingId ? "Update product details" : "Enter product details to add to inventory"}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-4 sm:px-6">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {/* Product Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm sm:text-base font-semibold">
                  Product Name *
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g., Coca Cola 500ml"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 sm:h-10 text-base"
                  required
                />
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="box_price" className="text-sm sm:text-base font-semibold">
                  Box Price (₹) *
                </Label>
                <Input
                  id="box_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 240.00"
                  value={boxPrice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBoxPrice(v);
                    const num = parseFloat(v);
                    setPcsPrice(Number.isFinite(num) && num > 0 ? (num / 24).toFixed(2) : "");
                  }}
                  className="h-11 sm:h-10 text-base"
                  inputMode="decimal"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">PCS is auto-calculated as Box ÷ 24</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pcs_price" className="text-sm sm:text-base font-semibold">
                  PCS Price (₹)
                </Label>
                <Input
                  id="pcs_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={pcsPrice}
                  readOnly
                  disabled
                  className="h-11 sm:h-10 text-base"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm sm:text-base font-semibold">
                  Description (Optional)
                </Label>
                <Textarea
                  id="description"
                  placeholder="Add any additional details about the product"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-20 text-base resize-none"
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  variant={editingId ? "default" : "success"}
                  size="lg"
                  className="flex-1 h-12 sm:h-11 text-base font-semibold touch-manipulation"
                  disabled={loading}
                >
                  {editingId ? (
                    <>
                      <Save className="w-5 h-5 mr-2" />
                      {loading ? "Updating..." : "Update Product"}
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 mr-2" />
                      {loading ? "Adding..." : "Add Product"}
                    </>
                  )}
                </Button>
                
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={resetForm}
                    className="h-12 sm:h-11 px-6 touch-manipulation"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Products List */}
        <Card className="border-0 shadow-strong">
          <CardHeader className="pb-4 px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl font-bold">
              All Products ({activeProducts.length})
            </CardTitle>
            <CardDescription className="text-sm">
              Manage your product inventory
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-4 sm:px-6">
            {products.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-base">No products added yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your first product using the form above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeProducts.map((product) => {
                  const boxPrice = product.box_price ?? product.price ?? ((product.pcs_price ?? 0) * 24);
                  const pcsPrice = product.pcs_price ?? ((product.box_price ?? product.price ?? 0) / 24);
                  return (
                  <Card key={product.id} className="border border-border hover:border-primary/50 transition-colors">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground text-base mb-1">{product.name}</h4>
                          <p className="text-sm text-muted-foreground mb-1">Box: ₹{boxPrice.toFixed(2)} · PCS: ₹{pcsPrice.toFixed(2)}</p>
                          {product.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(product)}
                            className="h-9 w-9 touch-manipulation"
                            title="Edit product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setDeleteId(product.id)}
                            className="h-9 w-9 text-destructive hover:text-destructive touch-manipulation"
                            title="Delete product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
                
                {inactiveProducts.length > 0 && (
                  <>
                    <div className="pt-4 pb-2">
                      <h4 className="text-sm font-semibold text-muted-foreground">
                        Inactive Products ({inactiveProducts.length})
                      </h4>
                    </div>
                    {inactiveProducts.map((product) => {
                      const boxPrice = product.box_price ?? product.price ?? ((product.pcs_price ?? 0) * 24);
                      const pcsPrice = product.pcs_price ?? ((product.box_price ?? product.price ?? 0) / 24);
                      return (
                      <Card key={product.id} className="border border-border opacity-60">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-base mb-1">{product.name}</h4>
                              <p className="text-sm text-muted-foreground mb-1">Box: ₹{boxPrice.toFixed(2)} · PCS: ₹{pcsPrice.toFixed(2)}</p>
                              {product.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                              )}
                            </div>
                            
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleEdit(product)}
                                className="h-9 w-9 touch-manipulation"
                                title="Edit product"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setDeleteId(product.id)}
                                className="h-9 w-9 text-destructive hover:text-destructive touch-manipulation"
                                title="Delete product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-md mx-3 sm:mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-manipulation">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 touch-manipulation"
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AddProduct;
