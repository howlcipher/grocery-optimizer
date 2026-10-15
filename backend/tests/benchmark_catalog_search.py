import time
import tracemalloc
from collections.abc import Sequence

from app.catalog.search import search_products
from app.domain.models import Product
from app.seed.data import SEED_PRODUCTS


def generate_synthetic_catalog(count: int) -> list[Product]:
    """Generates synthetic realistic grocery products for scaling benchmarks."""
    brands = [
        "Organic Valley", "Kroger", "Great Value", "Kirkland Signature", 
        "Tyson", "Dole", "General Mills", "Kellogg's", "Barilla", "Kraft",
        "Chobani", "Silk", "Horizon", "Heinz", "Campbell's", "Nestle",
        "Pepsi", "Coca-Cola", "Frito-Lay", "Nabisco"
    ]
    items = [
        ("Whole Milk", "gal", ["1", "0.5"]),
        ("2% Reduced Fat Milk", "gal", ["1", "0.5"]),
        ("Almond Milk Unsweetened", "fl oz", ["64", "32"]),
        ("Oat Milk Extra Creamy", "fl oz", ["64", "32"]),
        ("Large Grade A Eggs", "ct", ["12", "18", "30"]),
        ("Cage Free Brown Eggs", "ct", ["12", "18"]),
        ("Boneless Skinless Chicken Breast", "lb", ["1", "2.5", "5"]),
        ("80/20 Ground Beef", "lb", ["1", "3", "5"]),
        ("Sliced Sourdough Bread", "oz", ["24", "16"]),
        ("Whole Wheat Bread", "oz", ["20", "16"]),
        ("Gala Apples", "lb", ["3", "5"]),
        ("Bananas", "lb", ["2", "3"]),
        ("Baby Spinach", "oz", ["5", "16"]),
        ("Sharp Cheddar Cheese Block", "oz", ["8", "16"]),
        ("Greek Yogurt Plain", "oz", ["32", "5.3"]),
        ("Creamy Peanut Butter", "oz", ["16", "28"]),
        ("Original Cheerios Cereal", "oz", ["12", "18"]),
        ("Honey Nut Cheerios", "oz", ["10.8", "15.4"]),
        ("Spaghetti Pasta", "oz", ["16", "32"]),
        ("Marinara Pasta Sauce", "oz", ["24", "32"]),
    ]
    
    catalog: list[Product] = []
    idx = 0
    while len(catalog) < count:
        brand = brands[idx % len(brands)]
        item_name, unit, sizes = items[(idx // len(brands)) % len(items)]
        size = sizes[idx % len(sizes)]
        
        prod_id = f"synth-prod-{idx:06d}"
        full_name = f"{brand} {item_name} {size} {unit}"
        aliases = [
            item_name.lower(),
            f"{brand.lower()} {item_name.lower()}",
            item_name.split()[0].lower(),
        ]
        
        catalog.append(
            Product(
                id=prod_id,
                name=full_name,
                brand=brand,
                package_quantity=size,
                package_unit=unit,
                aliases=aliases,
                upc=f"0000{idx:08d}",
            )
        )
        idx += 1
        
    return catalog


BENCHMARK_QUERIES = [
    # Exact brand or product name
    "Dairy Pure Whole Milk",
    "Cheerios",
    # Prefix matches
    "appl",
    "chick",
    "org",
    "mil",
    "peast",
    # Substring matches
    "breast",
    "sauce",
    "cheddar",
    "sourdough",
    # Common short aliases
    "oj",
    "milk",
    "eggs",
    # Multi-word queries
    "organic brown eggs",
    "peanut butter creamy",
    "almond milk unsweetened",
    # No match
    "dragonfruit exotic",
    "nonexistent_grocery_xyz",
]


def benchmark_search_latency(catalog: Sequence[Product], queries: list[str], iterations: int = 5) -> dict:
    """Measures P50, P95, and average latency in microseconds per search query."""
    latencies_us: list[float] = []
    
    for _ in range(iterations):
        for q in queries:
            t0 = time.perf_counter()
            _ = search_products(q, catalog, limit=10)
            t1 = time.perf_counter()
            latencies_us.append((t1 - t0) * 1_000_000.0)
            
    latencies_us.sort()
    p50 = latencies_us[int(len(latencies_us) * 0.50)]
    p95 = latencies_us[int(len(latencies_us) * 0.95)]
    p99 = latencies_us[int(len(latencies_us) * 0.99)]
    avg = sum(latencies_us) / len(latencies_us)
    
    return {
        "catalog_size": len(catalog),
        "total_queries_executed": len(latencies_us),
        "p50_us": round(p50, 1),
        "p95_us": round(p95, 1),
        "p99_us": round(p99, 1),
        "avg_us": round(avg, 1),
        "qps": int(1_000_000.0 / avg) if avg > 0 else 0,
    }


def test_search_benchmark_scaling():
    """Verify in-memory search scaling meets SLA targets across 100, 1k, and 10k catalogs."""
    # 1. Baseline catalog (SEED_PRODUCTS)
    baseline_stats = benchmark_search_latency(SEED_PRODUCTS, BENCHMARK_QUERIES, iterations=10)
    assert baseline_stats["avg_us"] < 500.0, f"Baseline search too slow: {baseline_stats['avg_us']}µs"
    
    # 2. 1,000 products catalog
    cat_1k = generate_synthetic_catalog(1_000)
    stats_1k = benchmark_search_latency(cat_1k, BENCHMARK_QUERIES, iterations=5)
    # SLA: 1,000 products search must complete in < 10ms average
    assert stats_1k["avg_us"] < 10000.0, f"1k catalog search too slow: {stats_1k['avg_us']}µs"
    
    # 3. 10,000 products catalog
    tracemalloc.start()
    cat_10k = generate_synthetic_catalog(10_000)
    _current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    stats_10k = benchmark_search_latency(cat_10k, BENCHMARK_QUERIES, iterations=2)
    # SLA: 10,000 products search must complete in < 75ms average (in-memory linear scan)
    assert stats_10k["avg_us"] < 75000.0, f"10k catalog search too slow: {stats_10k['avg_us']}µs"
    
    # Memory footprint for 10k items should be modest (< 20MB)
    assert peak_mem < 20 * 1024 * 1024, f"10k catalog memory too high: {peak_mem / 1024 / 1024:.2f}MB"
    
    # Ensure distinct package sizes and determinism are preserved at scale
    results = search_products("cheerios", cat_10k, limit=10)
    assert len(results) > 0
    # Results must be strictly deterministic across repeated runs
    results_repeat = search_products("cheerios", cat_10k, limit=10)
    assert [r.id for r in results] == [r.id for r in results_repeat]


if __name__ == "__main__":
    print("================================================================================")
    print("GROCERY OPTIMIZER — CATALOG SEARCH PERFORMANCE BENCHMARK (GO-002)")
    print("================================================================================")
    
    for size in [len(SEED_PRODUCTS), 1_000, 10_000]:
        cat = SEED_PRODUCTS if size == len(SEED_PRODUCTS) else generate_synthetic_catalog(size)
        stats = benchmark_search_latency(cat, BENCHMARK_QUERIES, iterations=10 if size <= 1000 else 5)
        print(f"Catalog Size: {stats['catalog_size']:>6} items | "
              f"P50: {stats['p50_us']:>6.1f}µs | "
              f"P95: {stats['p95_us']:>6.1f}µs | "
              f"Avg: {stats['avg_us']:>6.1f}µs ({stats['avg_us']/1000.0:.2f}ms) | "
              f"Throughput: {stats['qps']:>6} QPS")
    print("================================================================================")
