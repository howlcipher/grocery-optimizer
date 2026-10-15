import React, { useState, useEffect, useRef } from "react";
import { Product } from "../types";
import { api } from "../api/client";

interface ProductSearchProps {
  onSelectProduct: (product: Product) => void;
  disabled?: boolean;
  isProductStaple?: (productId: string) => boolean;
  onToggleStaple?: (productId: string) => void;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({
  onSelectProduct,
  disabled = false,
  isProductStaple,
  onToggleStaple,
}) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await api.searchProducts(query.trim(), 8);
        setSuggestions(results);
        setIsOpen(true);
        setHighlightedIndex(-1);
        setSearched(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    setSearched(false);
    inputRef.current?.focus();
  };

  return (
    <div className="search-container" ref={containerRef}>
      <label
        htmlFor="product-search-input"
        style={{
          display: "block",
          fontWeight: 600,
          marginBottom: 8,
          fontSize: "1rem",
        }}
      >
        Add groceries to your list
      </label>
      <input
        ref={inputRef}
        id="product-search-input"
        type="search"
        className="search-input touch-target"
        placeholder="Search milk, eggs, cheerios, coffee..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="product-search-suggestions"
        autoComplete="off"
      />

      {isOpen && (
        <ul
          id="product-search-suggestions"
          className="search-suggestions"
          role="listbox"
        >
          {suggestions.length > 0 ? (
            suggestions.map((prod, idx) => (
              <li
                key={prod.id}
                role="option"
                aria-selected={idx === highlightedIndex}
                className={`suggestion-item ${
                  idx === highlightedIndex ? "highlighted" : ""
                }`}
                onClick={() => handleSelect(prod)}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <div>
                  <div className="suggestion-name">{prod.name}</div>
                  <div className="suggestion-meta">
                    {prod.brand} • {prod.package_quantity} {prod.package_unit}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {onToggleStaple && (
                    <button
                      type="button"
                      className="touch-target star-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStaple(prod.id);
                      }}
                      aria-label={isProductStaple && isProductStaple(prod.id) ? `Remove ${prod.name} from staples` : `Add ${prod.name} to staples`}
                      title={isProductStaple && isProductStaple(prod.id) ? "In My Staples" : "Add to My Staples"}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "1.25rem",
                        cursor: "pointer",
                        padding: "0 6px",
                        color: isProductStaple && isProductStaple(prod.id) ? "#f59e0b" : "#94a3b8",
                      }}
                    >
                      {isProductStaple && isProductStaple(prod.id) ? "★" : "☆"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary touch-target"
                    style={{ height: 36, padding: "0 12px", fontSize: "0.875rem" }}
                    tabIndex={-1}
                    aria-label={`Add ${prod.name}`}
                  >
                    + Add
                  </button>
                </div>
              </li>
            ))
          ) : searched && !isLoading ? (
            <li
              className="suggestion-item"
              style={{ color: "var(--color-text-muted)" }}
            >
              No matching products found. Try searching for milk, eggs, bread, or coffee.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
};
