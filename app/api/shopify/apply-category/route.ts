import { NextRequest, NextResponse } from "next/server";
import { syncProductToShopify } from "@/lib/shopify";
import type { SyncPayload } from "@/types";

/** Slim product shape — only the fields needed for derivation. */
interface SlimProduct {
  id: number;
  vendor: string;
  tags: string;
  options: Array<{ name: string; values: string[] }>;
  firstVariantSku: string;
  firstVariantBarcode: string;
}

function deriveCategory(p: SlimProduct): Partial<SyncPayload["fields"]> {
  const colorOpt = p.options.find((o) => /colou?r|couleur/i.test(o.name));
  const sizeOpt = p.options.find((o) => /size|taille/i.test(o.name));

  const tags = (p.tags ?? "")
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const isMale = tags.some((t) =>
    ["homme", "hommes", "men", "man", "masculin", "male", "garçon", "garcon", "boy"].includes(t)
  );
  const isFemale = tags.some((t) =>
    ["femme", "femmes", "women", "woman", "féminin", "feminin", "female", "fille", "girl"].includes(t)
  );
  const isKid = tags.some((t) =>
    ["kid", "kids", "enfant", "enfants", "children", "child", "youth", "bébé", "bebe", "baby", "junior"].includes(t)
  );

  const isValidGtin = /^\d{8}$|^\d{12,14}$/.test(p.firstVariantBarcode);

  const fields: Partial<SyncPayload["fields"]> = {
    googleGender: isMale ? "male" : isFemale ? "female" : "unisex",
    googleAgeGroup: isKid ? "kids" : "adult",
    googleCondition: "new",
  };

  if (p.vendor) fields.googleBrand = p.vendor;
  if (colorOpt?.values.length) fields.googleColor = colorOpt.values.join(" / ");
  if (sizeOpt?.values.length) fields.googleSize = sizeOpt.values.join(", ");
  if (p.firstVariantSku) fields.googleMpn = p.firstVariantSku;
  if (isValidGtin) fields.googleGtin = p.firstVariantBarcode;

  return fields;
}

export async function POST(req: NextRequest) {
  try {
    const { products } = (await req.json()) as { products: SlimProduct[] };

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "Aucun produit fourni" }, { status: 400 });
    }

    const results: Array<{
      productId: number;
      fields: Partial<SyncPayload["fields"]>;
      status: "applied" | "skipped" | "failed";
    }> = [];

    for (const product of products) {
      const fields = deriveCategory(product);

      try {
        await syncProductToShopify({ productId: product.id, fields });
        results.push({ productId: product.id, fields, status: "applied" });
      } catch {
        results.push({ productId: product.id, fields, status: "failed" });
      }
    }

    const applied = results.filter((r) => r.status === "applied").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({ applied, skipped, failed, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
