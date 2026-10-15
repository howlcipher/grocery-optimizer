export interface Product {
  id: string;
  name: string;
  brand: string;
  package_quantity: string;
  package_unit: string;
  aliases: string[];
}

export interface GroceryItem {
  id: string;
  product_id: string;
  quantity: number;
  product: Product;
  created_at: string;
  updated_at: string;
}

export interface GroceryList {
  id: string;
  name: string | null;
  items: GroceryItem[];
  created_at: string;
  updated_at: string;
}

export interface StoreResponse {
  id: string;
  retailer_name: string;
  name: string;
  sort_order: number;
}

export interface PlanItemResponse {
  product_id: string;
  product_name: string;
  store_id: string;
  store_name: string;
  quantity: number;
  unit_price_cents: number;
  regular_price_cents: number;
  is_on_sale: boolean;
  subtotal_cents: number;
}

export interface ShoppingPlanResponse {
  is_complete: boolean;
  stores: StoreResponse[];
  items: PlanItemResponse[];
  total_cents: number;
  missing_products: Product[];
}

export interface ComparisonResponse {
  one_store_plan: ShoppingPlanResponse;
  best_plan: ShoppingPlanResponse;
  savings_cents: number | null;
  additional_stops: number;
  pricing_source: string;
  pricing_source_label: string;
  is_demonstration: boolean;
  data_notice: string | null;
}

export interface SavedListMetadata {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PriceObservation {
  id: string;
  product_id: string;
  product_name: string;
  product_brand: string;
  store_id: string | null;
  store_name: string;
  price_cents: number;
  formatted_price: string;
  observation_date: string;
  is_promotional: boolean;
  is_stale: boolean;
  notes: string | null;
  source: string;
  source_attribution: string;
  created_at: string;
  updated_at: string;
}

export interface ProductPricesComparisonResponse {
  product: Product;
  observations: PriceObservation[];
  cheapest_observation: PriceObservation | null;
  store_count: number;
  source: string;
  disclaimer: string;
}

