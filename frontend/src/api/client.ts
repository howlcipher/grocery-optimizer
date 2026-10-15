import {
  ComparisonResponse,
  GroceryList,
  Product,
} from "../types";

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
    source: "demonstration" | "user_contributed" = "demonstration"
  ): Promise<ComparisonResponse> {
    const params = new URLSearchParams({ source });
    return request<ComparisonResponse>(`/lists/${listId}/compare?${params.toString()}`, {
      method: "POST",
    });
  },

  async getPriceObservations(
    productId?: string,
    storeId?: string,
    limit = 50
  ): Promise<import("../types").PriceObservation[]> {
    const params = new URLSearchParams();
    if (productId) params.set("product_id", productId);
    if (storeId) params.set("store_id", storeId);
    params.set("limit", String(limit));
    return request<import("../types").PriceObservation[]>(`/price-observations?${params.toString()}`);
  },

  async createPriceObservation(data: {
    product_id: string;
    store_name: string;
    price_cents: number;
    observation_date: string;
    is_promotional?: boolean;
    notes?: string | null;
  }): Promise<import("../types").PriceObservation> {
    return request<import("../types").PriceObservation>("/price-observations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updatePriceObservation(
    observationId: string,
    data: {
      store_name?: string;
      price_cents?: number;
      observation_date?: string;
      is_promotional?: boolean;
      notes?: string | null;
    }
  ): Promise<import("../types").PriceObservation> {
    return request<import("../types").PriceObservation>(`/price-observations/${observationId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deletePriceObservation(observationId: string): Promise<{ status: string; id: string }> {
    return request<{ status: string; id: string }>(`/price-observations/${observationId}`, {
      method: "DELETE",
    });
  },

  async compareProductStorePrices(
    productId: string
  ): Promise<import("../types").ProductPricesComparisonResponse> {
    return request<import("../types").ProductPricesComparisonResponse>(`/products/${productId}/prices`);
  },
};

