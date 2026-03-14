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
    const withMeta = url.searchParams.get("meta") !== "false";

    if (!withMeta) {
      // Fast path: return products without metafields
      const basic = products.map((p) => enrichProduct(p, []));
      return NextResponse.json({ products: basic, total: basic.length });
    }

    // Slow path: fetch metafields for a subset (paginated by ?offset=&limit=)
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const limit = parseInt(url.searchParams.get("limit") ?? "10");
    const slice = products.slice(offset, offset + limit);

    const enriched: EnrichedProduct[] = [];
    for (const product of slice) {
      try {
        const metafields = await fetchProductMetafields(product.id);
        enriched.push(enrichProduct(product, metafields));
      } catch {
        enriched.push(enrichProduct(product, []));
      }
      await new Promise((r) => setTimeout(r, 550)); // ~1.8 req/sec
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
