import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Route, 
  ShoppingCart, 
  Plus, 
  BarChart3, 
  LogOut, 
  User,
  Package
} from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>({ email: 'demo@driver.com' }); // Temporary mock user

  // Temporarily disabled auth check
  // useEffect(() => {
  //   const getUser = async () => {
  //     const { data: { user } } = await supabase.auth.getUser();
  //     if (!user) {
  //       navigate("/auth");
  //       return;
  //     }
  //     setUser(user);
  //   };
  //   getUser();
  // }, [navigate]);

  const handleLogout = () => {
    // Temporarily disabled logout
    toast({
      title: "Info",
      description: "Authentication is temporarily disabled",
    });
  };


  const quickActions = [
    {
      title: "Start Route",
      description: "Begin today's delivery route",
      icon: Route,
      color: "bg-gradient-to-r from-business-blue to-business-blue-dark",
      action: () => navigate("/start-route"),
    },
    {
      title: "Shop Billing",
      description: "Create bills for shop sales",
      icon: ShoppingCart,
      color: "bg-gradient-to-r from-success-green to-accent",
      action: () => navigate("/shop-billing"),
    },
    {
      title: "Add Product",
      description: "Add new products to inventory",
      icon: Plus,
      color: "bg-gradient-to-r from-warning to-warning/80",
      action: () => navigate("/add-product"),
    },
    {
      title: "Day Summary",
      description: "View today's sales summary",
      icon: BarChart3,
      color: "bg-gradient-to-r from-primary to-primary-dark",
      action: () => navigate("/summary"),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-accent-light/20">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-business-blue to-business-blue-dark rounded-lg sm:rounded-xl flex items-center justify-center">
                <Route className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold text-foreground">Cold Drink Sales</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Driver Dashboard</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <User className="w-4 h-4" />
                <span className="font-medium">{user?.email?.split('@')[0] || 'Driver'}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="h-9 w-9 p-0">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-safe">
        {/* Welcome Section */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">Welcome Back!</h2>
          <p className="text-muted-foreground text-sm sm:text-base">Ready to start your delivery route today?</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Card className="border-0 shadow-soft bg-gradient-to-r from-primary-light to-primary-light/80">
            <CardContent className="p-3 sm:p-4 text-center">
              <Package className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-primary" />
              <p className="text-xl sm:text-2xl font-bold text-primary">6</p>
              <p className="text-xs sm:text-sm text-primary/80">Products</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-soft bg-gradient-to-r from-success-green-light to-success-green-light/80">
            <CardContent className="p-3 sm:p-4 text-center">
              <Route className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-success-green" />
              <p className="text-xl sm:text-2xl font-bold text-success-green">4</p>
              <p className="text-xs sm:text-sm text-success-green/80">Routes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-soft bg-gradient-to-r from-accent-light to-accent-light/80">
            <CardContent className="p-3 sm:p-4 text-center">
              <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-accent" />
              <p className="text-xl sm:text-2xl font-bold text-accent">₹0</p>
              <p className="text-xs sm:text-sm text-accent/80">Sales</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {quickActions.map((action, index) => (
              <Card 
                key={index} 
                className="border-0 shadow-medium active:shadow-strong transition-all duration-200 cursor-pointer group active:scale-[0.98] sm:hover:scale-[1.02] touch-manipulation"
                onClick={action.action}
              >
                <CardHeader className="pb-3 sm:pb-4 p-4 sm:p-6">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl ${action.color} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <action.icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <CardTitle className="text-lg sm:text-xl font-bold">{action.title}</CardTitle>
                  <CardDescription className="text-sm sm:text-base">{action.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <Button variant="card" className="w-full h-10 sm:h-9 text-sm sm:text-base touch-manipulation">
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;