import {
  BatchPriceObservationRequest,
  BatchPriceObservationResponse,
  ComparisonResponse,
  GroceryList,
  PriceObservation,
  Product,
  ProductPricesComparisonResponse,
  StoreResponse,
} from "../types";
import {
  getObservationToken,
  removeObservationToken,
  saveObservationToken,
  saveRecentStore,
} from "../lib/storage";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errData = await response.json();
      if (errData && errData.detail) {
        if (typeof errData.detail === "string") {
          errorMessage = errData.detail;
        } else if (Array.isArray(errData.detail)) {
          errorMessage = errData.detail.map((e: { msg: string }) => e.msg).join(", ");
        }
      }
    } catch {
      // Keep default message if not JSON
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export const api = {
  async searchProducts(query: string, limit = 10): Promise<Product[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return request<Product[]>(`/products?${params.toString()}`);
  },

  async getProducts(limit = 100): Promise<Product[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    return request<Product[]>(`/products?${params.toString()}`);
  },

  async createList(name?: string): Promise<GroceryList> {
    return request<GroceryList>("/lists", {
      method: "POST",
      body: JSON.stringify({ name: name || null }),
    });
  },

  async getList(listId: string): Promise<GroceryList> {
    return request<GroceryList>(`/lists/${listId}`);
  },

  async updateListName(listId: string, name: string): Promise<GroceryList> {
    return request<GroceryList>(`/lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async addItem(listId: string, productId: string, quantity = 1): Promise<GroceryList> {
    return request<GroceryList>(`/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity }),
    });
  },

  async updateItemQuantity(listId: string, itemId: string, quantity: number): Promise<GroceryList> {
    return request<GroceryList>(`/lists/${listId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  },

  async removeItem(listId: string, itemId: string): Promise<GroceryList> {
    return request<GroceryList>(`/lists/${listId}/items/${itemId}`, {
      method: "DELETE",
    });
  },

  async comparePrices(
    listId: string,
    source: "demonstration" | "user_contributed" = "demonstration",
    zipCode?: string | null,
    regionScope: "exact" | "neighborhood" | "regional" = "exact"
  ): Promise<ComparisonResponse> {
    const params = new URLSearchParams({ source, region_scope: regionScope });
    if (zipCode && zipCode.trim()) {
      params.set("zip_code", zipCode.trim());
    }
    return request<ComparisonResponse>(`/lists/${listId}/compare?${params.toString()}`, {
      method: "POST",
    });
  },

  async getStores(zipCode?: string, q?: string, limit = 50): Promise<StoreResponse[]> {
    const params = new URLSearchParams();
    if (zipCode && zipCode.trim()) params.set("zip_code", zipCode.trim());
    if (q && q.trim()) params.set("q", q.trim());
    params.set("limit", String(limit));
    return request<StoreResponse[]>(`/stores?${params.toString()}`);
  },

  async getPriceObservations(
    productId?: string,
    storeId?: string,
    zipCode?: string,
    limit = 50
  ): Promise<PriceObservation[]> {
    const params = new URLSearchParams();
    if (productId) params.set("product_id", productId);
    if (storeId) params.set("store_id", storeId);
    if (zipCode) params.set("zip_code", zipCode);
    params.set("limit", String(limit));
    return request<PriceObservation[]>(`/price-observations?${params.toString()}`);
  },

  async createPriceObservation(data: {
    product_id: string;
    store_name: string;
    store_id?: string | null;
    retailer_name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    price_cents: number;
    observation_date: string;
    is_promotional?: boolean;
    notes?: string | null;
  }): Promise<PriceObservation> {
    const created = await request<PriceObservation>("/price-observations", {
      method: "POST",
      body: JSON.stringify(data),
    });

    // Save capability token to localStorage
    if (created.edit_token) {
      saveObservationToken(created.id, created.edit_token);
    }

    // Save recent store
    saveRecentStore({
      id: created.store_id || undefined,
      retailer_name: data.retailer_name || undefined,
      name: created.store_name,
      address: data.address,
      city: created.store_city || data.city,
      state: created.store_state || data.state,
      zip_code: created.store_zip_code || data.zip_code,
      is_unresolved_location: created.is_unresolved_location,
    });

    return created;
  },

  async createBatchPriceObservations(
    data: BatchPriceObservationRequest
  ): Promise<BatchPriceObservationResponse> {
    const res = await request<BatchPriceObservationResponse>("/price-observations/batch", {
      method: "POST",
      body: JSON.stringify(data),
    });

    // Save capability tokens for each observation
    for (const obs of res.observations) {
      if (obs.edit_token) {
        saveObservationToken(obs.id, obs.edit_token);
      }
    }

    // Save recent store
    if (res.store) {
      saveRecentStore(res.store);
    }

    return res;
  },

  async updatePriceObservation(
    observationId: string,
    data: {
      store_name?: string;
      price_cents?: number;
      observation_date?: string;
      is_promotional?: boolean;
      notes?: string | null;
    },
    explicitToken?: string | null
  ): Promise<PriceObservation> {
    const token = explicitToken || getObservationToken(observationId);
    const headers: Record<string, string> = {};
    if (token) {
      headers["X-Edit-Token"] = token;
    }

    return request<PriceObservation>(`/price-observations/${observationId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(data),
    });
  },

  async deletePriceObservation(
    observationId: string,
    explicitToken?: string | null
  ): Promise<{ status: string; id: string }> {
    const token = explicitToken || getObservationToken(observationId);
    const headers: Record<string, string> = {};
    if (token) {
      headers["X-Edit-Token"] = token;
    }

    const res = await request<{ status: string; id: string }>(
      `/price-observations/${observationId}`,
      {
        method: "DELETE",
        headers,
      }
    );

    removeObservationToken(observationId);
    return res;
  },

  async compareProductStorePrices(
    productId: string,
    zipCode?: string | null
  ): Promise<ProductPricesComparisonResponse> {
    const params = new URLSearchParams();
    if (zipCode && zipCode.trim()) {
      params.set("zip_code", zipCode.trim());
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<ProductPricesComparisonResponse>(`/products/${productId}/prices${query}`);
  },
};
