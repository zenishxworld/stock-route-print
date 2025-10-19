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
  // Water variants (ensure coverage for common spellings)
  "1 liter water",
  "1 litter water",
  "1 little water mrp 20",
  "500 ml water mrp 10",
  "50 ml water",
];

// Per-unit default pricing map (case-insensitive keys)
export const UNIT_PRICE_MAP: Record<string, { pcs: number; box: number }> = {
  // Fresh beverages — pcs: 10, box: 170
  "fresh instant energy 200 ml": { pcs: 10, box: 170 },
  "fresh jeera 200 ml": { pcs: 10, box: 170 },
  "fresh pepyo 200 ml": { pcs: 10, box: 170 },
  "fresh club soda 300ml": { pcs: 10, box: 170 },
  "fresh jeera 250 ml": { pcs: 10, box: 170 },
  "fresh mojito 200 ml": { pcs: 10, box: 170 },
  "fresh lahori 200 ml": { pcs: 10, box: 170 },
  "fresh blueberry soda 200ml": { pcs: 10, box: 170 },
  "fresh mango 200ml": { pcs: 10, box: 170 },
  "fresh cola 200 ml": { pcs: 10, box: 170 },
  "fresh clear lemon 200ml": { pcs: 10, box: 170 },

  // Water — normalize multiple spellings to required defaults
  // 1 liter water: pcs 20, box 80
  "1 liter water": { pcs: 20, box: 80 },
  "1 litter water": { pcs: 20, box: 80 },
  "1 little water mrp 20": { pcs: 20, box: 80 },

  // 500 ml / 50 ml water: pcs 10, box 100
  "500 ml water mrp 10": { pcs: 10, box: 100 },
  "50 ml water": { pcs: 10, box: 100 },
  "50ml water": { pcs: 10, box: 100 },
};

// Deterministic pseudo-random price generator so prices stay stable across runs
function stablePrice(name: string): number {
  const key = name.trim().toLowerCase();
  const unit = UNIT_PRICE_MAP[key];
  if (unit) return unit.pcs; // default base price aligns with pcs price

  // Fallback explicit prices for legacy entries based on provided MRP
  if (key === "1 little water mrp 20") return 20;
  if (key === "500 ml water mrp 10") return 10;

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
      .select("id,name,status,price,pcs_price,box_price");

    if (error) throw error;

    const existingNames = new Set<string>((existing || []).map((p: any) => (p.name || "").trim().toLowerCase()));

    const toInsert = DEFAULT_PRODUCT_NAMES
      .filter((n) => !existingNames.has(n.trim().toLowerCase()))
      .map((n) => {
        const key = n.trim().toLowerCase();
        const unit = UNIT_PRICE_MAP[key];
        const pcsPrice = unit?.pcs ?? stablePrice(n);
        const boxPrice = unit?.box ?? pcsPrice * 24; // enforce 24 pcs per box
        return {
          name: n,
          price: boxPrice, // treat legacy price as box price
          pcs_price: pcsPrice,
          box_price: boxPrice,
          description: null,
          status: "active",
        };
      });

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("products").insert(toInsert);
      if (insertError) throw insertError;
    }

    // Update existing products with per-unit prices where a mapping exists or current fields are missing
    const updates = (existing || [])
      .map((p: any) => {
        const key = (p.name || "").trim().toLowerCase();
        const unit = UNIT_PRICE_MAP[key];
        const needPcs = p.pcs_price == null;
        const needBox = p.box_price == null;
        if (!needPcs && !needBox) return null;

        const resolvedPcs = needPcs
          ? (p.box_price != null
              ? Number(p.box_price) / 24
              : (p.price != null
                  ? Number(p.price) / 24
                  : (unit?.pcs ?? stablePrice(p.name || ""))))
          : Number(p.pcs_price);

        const resolvedBox = needBox
          ? (p.pcs_price != null
              ? Number(p.pcs_price) * 24
              : (p.price != null
                  ? Number(p.price)
                  : resolvedPcs * 24))
          : Number(p.box_price);

        return { id: p.id, pcs_price: resolvedPcs, box_price: resolvedBox };
      })
      .filter(Boolean) as Array<{ id: string; pcs_price: number; box_price: number }>;

    if (updates.length > 0) {
      // Upsert by id: ensures we only update existing rows
      const { error: updateError } = await supabase
        .from("products")
        .update({ price: updates[0].box_price })
        .eq("id", updates[0].id);
      if (updateError) throw updateError;
    }
  } catch (e) {
    // Non-fatal: if we fail to seed, app should still work, just without defaults
    console.warn("seedDefaultProductsIfMissing failed:", e);
  }
}