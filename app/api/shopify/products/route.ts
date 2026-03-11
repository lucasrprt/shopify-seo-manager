import { NextResponse } from "next/server";
import { fetchAllProducts, fetchProductMetafields, enrichProduct } from "@/lib/shopify";
import type { EnrichedProduct } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const singleId = url.searchParams.get("id");

    // Single product fetch (for product detail page)
    if (singleId) {
      const { fetchProductWithMetafields } = await import("@/lib/shopify");
      const product = await fetchProductWithMetafields(Number(singleId));
      return NextResponse.json({ products: [product] });
    }

    const products = await fetchAllProducts();

    // Fetch metafields for all products in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 10;
    const enriched: EnrichedProduct[] = [];

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (product) => {
          try {
            const metafields = await fetchProductMetafields(product.id);
            return enrichProduct(product, metafields);
          } catch {
            return enrichProduct(product, []);
          }
        })
      );
      enriched.push(...batchResults);

      // Small delay between batches to respect Shopify rate limits (2 req/s)
      if (i + BATCH_SIZE < products.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return NextResponse.json({ products: enriched, total: enriched.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
