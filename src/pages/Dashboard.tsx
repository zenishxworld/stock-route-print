import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Truck, 
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
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-soft">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-r from-business-blue to-business-blue-dark rounded-xl flex items-center justify-center">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Cold Drink Sales</h1>
                <p className="text-sm text-muted-foreground">Driver Dashboard</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4" />
                <span className="font-medium">{user?.email?.split('@')[0] || 'Driver'}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Welcome Back!</h2>
          <p className="text-muted-foreground text-lg">Ready to start your delivery route today?</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-soft bg-gradient-to-r from-primary-light to-primary-light/80">
            <CardContent className="p-4 text-center">
              <Package className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold text-primary">6</p>
              <p className="text-sm text-primary/80">Products</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-soft bg-gradient-to-r from-success-green-light to-success-green-light/80">
            <CardContent className="p-4 text-center">
              <Route className="w-8 h-8 mx-auto mb-2 text-success-green" />
              <p className="text-2xl font-bold text-success-green">4</p>
              <p className="text-sm text-success-green/80">Routes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-soft bg-gradient-to-r from-warning-light to-warning-light/80">
            <CardContent className="p-4 text-center">
              <Truck className="w-8 h-8 mx-auto mb-2 text-warning" />
              <p className="text-2xl font-bold text-warning">3</p>
              <p className="text-sm text-warning/80">Trucks</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-soft bg-gradient-to-r from-accent-light to-accent-light/80">
            <CardContent className="p-4 text-center">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 text-accent" />
              <p className="text-2xl font-bold text-accent">₹0</p>
              <p className="text-sm text-accent/80">Today's Sales</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-2xl font-bold text-foreground mb-6">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {quickActions.map((action, index) => (
              <Card 
                key={index} 
                className="border-0 shadow-medium hover:shadow-strong transition-all duration-300 cursor-pointer group hover:scale-[1.02]"
                onClick={action.action}
              >
                <CardHeader className="pb-4">
                  <div className={`w-16 h-16 rounded-2xl ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <action.icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold">{action.title}</CardTitle>
                  <CardDescription className="text-base">{action.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="card" className="w-full">
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