import { supabase } from "@/integrations/supabase/client";

// Default product names from user request
export const DEFAULT_PRODUCT_NAMES: string[] = [
  "Fresh Instant Energy 200 ml",
  "Fresh Jeera 200 ml",
  "Fresh Pepyo 200 ml",
  "Fresh Club Soda 300ml",
  "Fresh Jeera 250 ml",
  "Fresh Mojito 200 ml",
  "Fresh Lahori 200 ml",
  "Fresh Blueberry Soda 200ml",
  "Fresh Mango 200ml",
  "Fresh Cola 200 ml",
  "Fresh Clear Lemon 200ml",
  "1 little water mrp 20",
  "500 ml water mrp 10",
  "250 ml Thumbs-up",
  "250 ml spite",
  "250 ml Fenta",
  "250 ml sosiyo",
];

// Deterministic pseudo-random price generator so prices stay stable across runs
function stablePrice(name: string): number {
  // Explicit prices for water items based on provided MRP
  if (name.trim().toLowerCase() === "1 little water mrp 20") return 20;
  if (name.trim().toLowerCase() === "500 ml water mrp 10") return 10;
  // Hash-based pseudo-random between 12 and 35
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  const base = 12; // min
  const range = 24; // 12..35
  return base + (Math.abs(h) % range);
}

// Upsert default products into the database if missing (case-insensitive by name)
export async function seedDefaultProductsIfMissing(): Promise<void> {
  try {
    const { data: existing, error } = await supabase
      .from("products")
      .select("id,name,status");

    if (error) throw error;

    const existingNames = new Set<string>((existing || []).map((p: any) => (p.name || "").trim().toLowerCase()));

    const toInsert = DEFAULT_PRODUCT_NAMES
      .filter((n) => !existingNames.has(n.trim().toLowerCase()))
      .map((n) => ({
        name: n,
        price: stablePrice(n),
        description: null,
        status: "active",
      }));

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("products").insert(toInsert);
      if (insertError) throw insertError;
      // Optionally: console.log("Inserted default products:", toInsert.length);
    }
  } catch (e) {
    // Non-fatal: if we fail to seed, app should still work, just without defaults
    console.warn("seedDefaultProductsIfMissing failed:", e);
  }
}