import { NextResponse } from "next/server";
import { fetchAllProducts, fetchMetafieldsBatch, enrichProduct } from "@/lib/shopify";
import type { EnrichedProduct } from "@/types";

export const dynamic = "force-dynamic";

// One GraphQL `nodes` query handles up to 50 products within Shopify's cost limit
const GRAPHQL_BATCH = 50;

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
    const withMeta = url.searchParams.get("meta") !== "false";

    if (!withMeta) {
      // Phase 1 — instant: return products without metafields
      const basic = products.map((p) => enrichProduct(p, []));
      return NextResponse.json({ products: basic, total: basic.length });
    }

    // Phase 2 — fast GraphQL batch: fetch metafields for a page of products.
    // Each GraphQL query covers GRAPHQL_BATCH products in a single round-trip
    // instead of one REST call per product, giving ~50× speedup.
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const limit = parseInt(url.searchParams.get("limit") ?? String(GRAPHQL_BATCH));
    const slice = products.slice(offset, offset + limit);

    // Split the page into GraphQL_BATCH-sized sub-batches (in case client
    // requests more than 50 at a time) and run them sequentially.
    const enriched: EnrichedProduct[] = [];
    for (let i = 0; i < slice.length; i += GRAPHQL_BATCH) {
      const chunk = slice.slice(i, i + GRAPHQL_BATCH);
      try {
        const metaMap = await fetchMetafieldsBatch(chunk.map((p) => p.id));
        for (const product of chunk) {
          enriched.push(enrichProduct(product, metaMap.get(product.id) ?? []));
        }
      } catch {
        // If GraphQL fails for a chunk, fall back to empty metafields
        for (const product of chunk) {
          enriched.push(enrichProduct(product, []));
        }
      }
    }

    return NextResponse.json({
      products: enriched,
      total: products.length,
      hasMore: offset + limit < products.length,
      nextOffset: offset + limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
