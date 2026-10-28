export interface Product {
  id: string;
  name: string;
  brand: string;
  package_quantity: string;
  package_unit: string;
  aliases: string[];
  category?: string | null;
  canonical_group?: string | null;
  upc?: string | null;
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
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_unresolved_location?: boolean;
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

export interface ItemPriceComparison {
  product_id: string;
  product_name: string;
  brand: string;
  package_quantity: string;
  package_unit: string;
  requested_quantity: number;
  kroger_price_cents?: number | null;
  kroger_regular_price_cents?: number | null;
  kroger_is_sale: boolean;
  kroger_date?: string | null;
  kroger_store_name?: string | null;
  meijer_price_cents?: number | null;
  meijer_regular_price_cents?: number | null;
  meijer_is_sale: boolean;
  meijer_date?: string | null;
  meijer_store_name?: string | null;
  cheaper_retailer?: "kroger" | "meijer" | "tie" | "incomplete" | null;
  item_savings_cents: number;
  unit_price_kroger_cents?: number | null;
  unit_price_meijer_cents?: number | null;
  unit_price_unit?: string | null;
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
  zip_code?: string | null;
  region_scope?: string | null;
  compared_zip_codes?: string[];
  // Mission 006 Two-Store Side-by-Side:
  kroger_plan?: ShoppingPlanResponse | null;
  meijer_plan?: ShoppingPlanResponse | null;
  split_plan?: ShoppingPlanResponse | null;
  split_gross_savings_cents?: number | null;
  extra_stop_justified?: boolean;
  kroger_coverage?: string | null;
  meijer_coverage?: string | null;
  kroger_coverage_ratio?: number | null;
  meijer_coverage_ratio?: number | null;
  is_coverage_complete?: boolean;
  item_comparisons?: ItemPriceComparison[];
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
  store_city?: string | null;
  store_state?: string | null;
  store_zip_code?: string | null;
  is_unresolved_location?: boolean;
  price_cents: number;
  formatted_price: string;
  observation_date: string;
  is_promotional: boolean;
  is_stale: boolean;
  notes: string | null;
  source: string;
  source_attribution: string;
  edit_token?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripItemObservation {
  product_id: string;
  product_name?: string;
  price_cents: number;
  is_promotional?: boolean;
  notes?: string | null;
}

export interface BatchPriceObservationRequest {
  store_name: string;
  store_id?: string | null;
  retailer_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  observation_date: string;
  items: TripItemObservation[];
}

export interface BatchPriceObservationResponse {
  observations: PriceObservation[];
  store: StoreResponse;
  created_count: number;
}

export interface ProductPricesComparisonResponse {
  product: Product;
  observations: PriceObservation[];
  cheapest_observation: PriceObservation | null;
  store_count: number;
  source: string;
  disclaimer: string;
}

export interface ParsedReceiptItem {
  rawText: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchConfidence: "high" | "medium" | "unmatched";
  candidateProducts?: Product[];
  priceCents: number;
  quantity?: number;
  isPromotional?: boolean;
}

export interface ParsedReceipt {
  storeName?: string | null;
  date?: string | null;
  hasRecognizedDate: boolean;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  items: ParsedReceiptItem[];
  rawText: string;
  ignoredLines: string[];
}

export interface StapleItem {
  product_id: string;
  preferred_quantity: number;
  created_at: string;
  last_used_at?: string;
  notes?: string;
}

export interface PurchaseHistoryItem {
  product_id: string;
  product_name: string;
  price_cents: number;
  quantity: number;
}

export interface PurchaseHistoryRecord {
  id: string;
  trip_date: string;
  store_name: string;
  retailer_name?: string | null;
  address?: string | null;
  city?: string | null;
  zip_code?: string | null;
  source: "receipt_scan" | "manual_trip";
  total_cents: number;
  items: PurchaseHistoryItem[];
  recorded_at: string;
}

export interface PriceTrendInfo {
  product_id: string;
  store_name: string;
  latest_price_cents: number;
  latest_date: string;
  previous_price_cents?: number | null;
  previous_date?: string | null;
  diff_cents?: number | null;
  trend_direction: "down" | "up" | "equal" | "insufficient_data" | "no_data";
  summary: string;
}

export interface ParsedPriceCandidate {
  raw_line: string;
  extracted_name: string;
  brand?: string | null;
  package_size?: string | null;
  regular_price_cents?: number | null;
  promotional_price_cents?: number | null;
  price_cents: number;
  is_promotional: boolean;
  promo_details?: string | null;
  matched_product_id?: string | null;
  matched_product_name?: string | null;
  match_confidence: "high" | "medium" | "unmatched";
  canonical_group?: string | null;
}

export interface PriceImportParseResponse {
  candidates: ParsedPriceCandidate[];
  unmatched_count: number;
  matched_count: number;
}

export interface BackupImportResponse {
  status: string;
  message: string;
  imported_products_count: number;
  imported_lists_count: number;
  imported_items_count: number;
  imported_observations_count: number;
}


