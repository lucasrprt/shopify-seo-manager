import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("id");
  if (!productId) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  const res = await fetch(
    `https://${domain}/admin/api/2024-10/products/${productId}.json`,
    { headers: { "X-Shopify-Access-Token": token!, "Content-Type": "application/json" } }
  );
  const data = await res.json() as { product: { id: number; title: string; variants: Array<{ id: number; title: string; sku: string; barcode: string | null }> } };

  return NextResponse.json({
    product: data.product.title,
    variants: data.product.variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
    })),
  });
}
