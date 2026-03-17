"use client";

import { useEffect, useState, useCallback } from "react";
import type { EnrichedProduct, FilterState, AIModel, GeneratedContent, SyncPayload } from "@/types";
import { ProductTable } from "@/components/ProductTable";
import { ProductFilters } from "@/components/ProductFilters";
import { BulkActionBar } from "@/components/BulkActionBar";
import { HealthBadge } from "@/components/HealthBadge";
import { ProgressPanel, type ProgressItem } from "@/components/ProgressPanel";
import { RefreshCw, ShoppingBag, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { computeHealth, slugify } from "@/lib/validators";

const DEFAULT_FILTERS: FilterState = {
  search: "",
  healthMin: 0,
  healthMax: 100,
  missingType: "all",
  missingField: "",
  vendor: "",
  productType: "",
  status: "all",
};

export default function DashboardPage() {
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<number[]>([]);
  const [model, setModel] = useState<AIModel>("openai");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [enrichedIds, setEnrichedIds] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{
    visible: boolean;
    operation: string;
    items: ProgressItem[];
  }>({ visible: false, operation: "", items: [] });

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  /** Open the progress panel with all products as "pending". */
  const initProgress = (ids: number[], operation: string) => {
    setProgress({
      visible: true,
      operation,
      items: ids.map((id) => ({
        id,
        name: products.find((p) => p.shopify.id === id)?.shopify.title ?? `Produit #${id}`,
        status: "pending",
        step: "En attente…",
      })),
    });
  };

  /** Update a single product row in the progress panel. */
  const tickProgress = (id: number, status: ProgressItem["status"], step: string) => {
    setProgress((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, status, step } : item
      ),
    }));
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEnriching(false);
    setEnrichProgress(0);
    setEnrichedIds(new Set());
    try {
      // Phase 1: load products instantly without metafields
      const res = await fetch("/api/shopify/products?meta=false");
      if (res.status === 401) throw new Error("Session expirée — veuillez vous reconnecter");
      const data = await res.json() as { products?: EnrichedProduct[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Erreur de chargement");
      const basicProducts = data.products ?? [];
      setProducts(basicProducts);
      setLoading(false);

      // Phase 2: enrich with metafields in background batches
      if (basicProducts.length === 0) return;
      setEnriching(true);
      const total = basicProducts.length;
      const batchSize = 50; // each server call = 1 GraphQL query covering 50 products
      let offset = 0;

      while (offset < total) {
        const r = await fetch(`/api/shopify/products?meta=true&offset=${offset}&limit=${batchSize}`);
        const d = await r.json() as { products?: EnrichedProduct[]; hasMore?: boolean; nextOffset?: number };
        if (d.products) {
          const batchIds = d.products.map((p) => p.shopify.id);
          setProducts((prev) => {
            const updated = [...prev];
            d.products!.forEach((enriched) => {
              const idx = updated.findIndex((p) => p.shopify.id === enriched.shopify.id);
              if (idx !== -1) updated[idx] = enriched;
            });
            return updated;
          });
          setEnrichedIds((prev) => {
            const next = new Set(prev);
            batchIds.forEach((id) => next.add(id));
            return next;
          });
        }
        offset = d.nextOffset ?? (offset + batchSize);
        setEnrichProgress(Math.min(100, Math.round((offset / total) * 100)));
        if (d.hasMore === false) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
      setEnriching(false);
      setEnrichProgress(100);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleBulkGenerate = async (ids: number[], mode: "full" | "seo" | "google") => {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const product = products.find((p) => p.shopify.id === id);
      if (!product) continue;
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product, model, mode }),
        });
        const data = await res.json() as { generated?: Partial<GeneratedContent>; error?: string };
        if (data.generated) {
          setProducts((prev) =>
            prev.map((p) => {
              if (p.shopify.id !== id) return p;
              const generated = { ...data.generated };
              if (generated.urlHandle) generated.urlHandle = slugify(generated.urlHandle);
              const updated = { ...p, ...generated };
              updated.health = computeHealth(updated);
              return updated;
            })
          );
          setEnrichedIds((prev) => { const next = new Set(prev); next.add(id); return next; });
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    showToast(
      `Génération : ${success} réussi${success > 1 ? "s" : ""}${failed > 0 ? `, ${failed} échoué${failed > 1 ? "s" : ""}` : ""}`,
      failed > 0 ? "error" : "success"
    );
  };

  const handleBulkGenerateAndSync = async (ids: number[], mode: "full" | "seo" | "google") => {
    initProgress(ids, "Générer & Synchroniser");
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const product = products.find((p) => p.shopify.id === id);
      if (!product) { tickProgress(id, "error", "Produit introuvable"); failed++; continue; }

      try {
        tickProgress(id, "active", "Génération IA…");
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product, model, mode }),
        });
        if (res.status === 401) throw new Error("Session expirée");
        const data = await res.json() as { generated?: Partial<GeneratedContent>; error?: string };
        if (!data.generated) throw new Error(data.error ?? "Erreur génération");

        const generated = { ...data.generated };
        if (generated.urlHandle) generated.urlHandle = slugify(generated.urlHandle);
        const updated = { ...product, ...generated };
        updated.health = computeHealth(updated);
        setProducts((prev) => prev.map((p) => p.shopify.id === id ? updated : p));
        setEnrichedIds((prev) => { const next = new Set(prev); next.add(id); return next; });

        tickProgress(id, "active", "Sync Shopify…");
        const syncRes = await fetch("/api/shopify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payloads: [{
              productId: id,
              fields: {
                seoTitle: updated.seoTitle, seoDescription: updated.seoDescription,
                urlHandle: updated.urlHandle, description: updated.description,
                googleCategory: updated.googleCategory, googleCondition: updated.googleCondition,
                googleAgeGroup: updated.googleAgeGroup, googleGender: updated.googleGender,
                googleGtin: updated.googleGtin, googleMpn: updated.googleMpn,
                googleBrand: updated.googleBrand, googleColor: updated.googleColor,
                googleMaterial: updated.googleMaterial, googleSize: updated.googleSize,
                googlePattern: updated.googlePattern, googleItemGroupId: updated.googleItemGroupId,
              },
            }],
          }),
        });
        const syncData = await syncRes.json() as { success?: number; failed?: number };
        if ((syncData.failed ?? 0) > 0) throw new Error("Échec sync Shopify");

        tickProgress(id, "done", "Généré & synchronisé ✓");
        success++;
      } catch (e) {
        tickProgress(id, "error", e instanceof Error ? e.message : "Erreur");
        failed++;
      }
    }

    showToast(
      `${success} généré${success !== 1 ? "s" : ""} & synchronisé${success !== 1 ? "s" : ""}${failed > 0 ? ` · ${failed} échoué${failed !== 1 ? "s" : ""}` : ""}`,
      failed > 0 ? "error" : "success"
    );
  };

  const handleApplyCategory = async (ids: number[]) => {
    initProgress(ids, "Champs catégorie");
    let applied = 0;
    let failed = 0;

    for (const id of ids) {
      const p = products.find((pr) => pr.shopify.id === id);
      if (!p) { tickProgress(id, "error", "Produit introuvable"); failed++; continue; }

      const slim = {
        id: p.shopify.id,
        title: p.shopify.title,
        vendor: p.shopify.vendor,
        productType: p.shopify.product_type,
        tags: p.shopify.tags,
        options: p.shopify.options ?? [],
        variants: (p.shopify.variants ?? []).map((v) => ({
          sku: v.sku, barcode: v.barcode ?? "", option1: v.option1, option2: v.option2,
        })),
      };

      try {
        tickProgress(id, "active", "Champs catégorie + IA…");
        const res = await fetch("/api/shopify/fill-category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: [slim], model }),
        });
        if (res.status === 401) throw new Error("Session expirée");
        const data = await res.json() as { applied?: number; failed?: number; totalTaxonomy?: number; error?: string };
        if (data.error) throw new Error(data.error);
        if ((data.failed ?? 0) > 0) throw new Error("Échec Shopify");

        const taxLabel = (data.totalTaxonomy ?? 0) > 0 ? ` · ${data.totalTaxonomy} champs IA` : "";
        tickProgress(id, "done", `Appliqué ✓${taxLabel}`);
        applied++;
      } catch (e) {
        tickProgress(id, "error", e instanceof Error ? e.message : "Erreur");
        failed++;
      }
    }

    showToast(
      `${applied} produit${applied !== 1 ? "s" : ""} mis à jour${failed > 0 ? ` · ${failed} échoué${failed !== 1 ? "s" : ""}` : ""}`,
      failed > 0 ? "error" : "success"
    );
  };

  const handleBulkSync = async (ids: number[]) => {
    initProgress(ids, "Synchronisation Shopify");
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const p = products.find((pr) => pr.shopify.id === id);
      if (!p) { tickProgress(id, "error", "Produit introuvable"); failed++; continue; }

      tickProgress(id, "active", "Sync en cours…");
      const payload: SyncPayload = {
        productId: id,
        fields: {
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
          urlHandle: p.urlHandle,
          description: p.description,
          googleCategory: p.googleCategory,
          googleCondition: p.googleCondition,
          googleAgeGroup: p.googleAgeGroup,
          googleGender: p.googleGender,
          googleGtin: p.googleGtin,
          googleMpn: p.googleMpn,
          googleBrand: p.googleBrand,
          googleColor: p.googleColor,
          googleMaterial: p.googleMaterial,
          googleSize: p.googleSize,
          googlePattern: p.googlePattern,
          googleItemGroupId: p.googleItemGroupId,
        },
      };

      try {
        const res = await fetch("/api/shopify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payloads: [payload] }),
        });
        if (res.status === 401) throw new Error("Session expirée");
        const data = await res.json() as { success?: number; failed?: number };
        if ((data.failed ?? 0) > 0) throw new Error("Shopify a rejeté la mise à jour");
        tickProgress(id, "done", "Synchronisé ✓");
        success++;
      } catch (e) {
        tickProgress(id, "error", e instanceof Error ? e.message : "Erreur");
        failed++;
      }
    }

    showToast(
      `${success} synchronisé${success !== 1 ? "s" : ""}${failed > 0 ? ` · ${failed} échoué${failed !== 1 ? "s" : ""}` : ""}`,
      failed > 0 ? "error" : "success"
    );
  };

  const handleFixGtin = async (ids: number[]) => {
    initProgress(ids, "Correction GTIN");
    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const id of ids) {
      const p = products.find((pr) => pr.shopify.id === id);
      if (!p) { tickProgress(id, "error", "Produit introuvable"); failed++; continue; }

      const gtinPattern = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;

      // Try variant barcodes first (strip non-digits)
      const validBarcodes = p.shopify.variants
        ?.map((v) => (v.barcode ?? "").replace(/\D/g, ""))
        .filter((b) => gtinPattern.test(b)) ?? [];

      // Fallback: clean the existing googleGtin value (e.g. "3614 274103180" → "3614274103180")
      if (validBarcodes.length === 0 && p.googleGtin) {
        const cleaned = p.googleGtin.replace(/\D/g, "");
        if (gtinPattern.test(cleaned)) validBarcodes.push(cleaned);
      }

      if (validBarcodes.length === 0) {
        tickProgress(id, "done", `Aucun barcode valide (actuel: "${p.googleGtin || "vide"}")`);
        skipped++;
        continue;
      }

      const variantCount = p.shopify.variants?.length ?? 1;
      const cleanGtin = validBarcodes[0];

      // Always sync the cleaned GTIN to the google/gtin metafield — for both
      // single and multi-variant products. For multi-variant, each variant's
      // barcode is already read by Shopify's Google feed directly, but we also
      // write the first valid barcode to the product metafield so the health
      // score stays correct after a page reload and any invalid value is cleared.
      tickProgress(id, "active", `Écriture GTIN ${cleanGtin}…`);
      try {
        const res = await fetch("/api/shopify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payloads: [{ productId: id, fields: { googleGtin: cleanGtin } }],
          }),
        });
        if (res.status === 401) throw new Error("Session expirée");
        const data = await res.json() as { success?: number; failed?: number };
        if ((data.failed ?? 0) > 0) throw new Error("Shopify a rejeté la mise à jour");

        setProducts((prev) =>
          prev.map((pr) => {
            if (pr.shopify.id !== id) return pr;
            const updated = { ...pr, googleGtin: cleanGtin };
            updated.health = computeHealth(updated);
            return updated;
          })
        );
        const label = variantCount > 1
          ? `${validBarcodes.length}/${variantCount} barcodes · GTIN → ${cleanGtin} ✓`
          : `GTIN → ${cleanGtin} ✓`;
        tickProgress(id, "done", label);
        success++;
      } catch (e) {
        tickProgress(id, "error", e instanceof Error ? e.message : "Erreur");
        failed++;
      }
    }

    const parts = [
      success > 0 ? `${success} corrigé${success !== 1 ? "s" : ""}` : "",
      skipped > 0 ? `${skipped} sans barcode` : "",
      failed > 0 ? `${failed} échoué${failed !== 1 ? "s" : ""}` : "",
    ].filter(Boolean).join(" · ");
    showToast(parts || "Aucune modification", failed > 0 ? "error" : "success");
  };

  const handleFixItemGroupId = async (ids: number[]) => {
    initProgress(ids, "Correction IDs GMC");
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const p = products.find((pr) => pr.shopify.id === id);
      if (!p) { tickProgress(id, "error", "Produit introuvable"); failed++; continue; }

      tickProgress(id, "active", "Correction item_group_id…");
      try {
        const res = await fetch("/api/shopify/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payloads: [{
              productId: id,
              fields: { googleItemGroupId: String(id) },
            }],
          }),
        });
        if (res.status === 401) throw new Error("Session expirée");
        const data = await res.json() as { success?: number; failed?: number };
        if ((data.failed ?? 0) > 0) throw new Error("Shopify a rejeté la mise à jour");

        // Update local state so the health score reflects the new value
        setProducts((prev) =>
          prev.map((pr) => {
            if (pr.shopify.id !== id) return pr;
            const updated = { ...pr, googleItemGroupId: String(id) };
            updated.health = computeHealth(updated);
            return updated;
          })
        );
        tickProgress(id, "done", `ID corrigé → ${id} ✓`);
        success++;
      } catch (e) {
        tickProgress(id, "error", e instanceof Error ? e.message : "Erreur");
        failed++;
      }
    }

    showToast(
      `${success} ID${success !== 1 ? "s" : ""} corrigé${success !== 1 ? "s" : ""}${failed > 0 ? ` · ${failed} échoué${failed !== 1 ? "s" : ""}` : ""}`,
      failed > 0 ? "error" : "success"
    );
  };

  const total = products.length;
  const perfect = products.filter((p) => p.health.score >= 80).length;
  const critical = products.filter((p) => p.health.score < 50).length;
  const avgScore = total > 0 ? Math.round(products.reduce((s, p) => s + p.health.score, 0) / total) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-none">Shopify SEO Manager</h1>
              <p className="text-xs text-gray-400 mt-0.5">Google Merchant · Optimisation française</p>
            </div>
          </div>
          <button
            onClick={loadProducts}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualiser
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 flex flex-col gap-5">
        {!loading && total > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total produits" value={total} icon="📦" />
            <StatCard label="Score moyen" value={`${avgScore}%`} icon="📊">
              <HealthBadge score={avgScore} size="sm" showBar />
            </StatCard>
            <StatCard label="Optimisés ≥80%" value={perfect} icon="✅" valueClass="text-green-600" />
            <StatCard label="Critiques <50%" value={critical} icon="🔴" valueClass="text-red-600" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-medium">Erreur de connexion Shopify</p>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
            <p className="text-lg font-medium text-gray-600">Chargement des produits...</p>
            <p className="text-sm mt-1">Connexion à Shopify en cours</p>
          </div>
        )}

        {enriching && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">Calcul des scores SEO en cours... {enrichProgress}%</p>
              <div className="mt-1.5 bg-blue-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${enrichProgress}%` }} />
              </div>
            </div>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <ProductFilters filters={filters} onChange={setFilters} products={products} />
            <ProductTable
              products={products}
              filters={filters}
              selected={selected}
              onSelectChange={setSelected}
              enriching={enriching}
              enrichedIds={enrichedIds}
            />
          </>
        )}
      </main>

      <BulkActionBar
        selected={selected}
        products={products}
        onClear={() => setSelected([])}
        model={model}
        onModelChange={setModel}
        onBulkGenerate={handleBulkGenerate}
        onBulkSync={handleBulkSync}
        onBulkGenerateAndSync={handleBulkGenerateAndSync}
        onApplyCategory={handleApplyCategory}
        onFixItemGroupId={handleFixItemGroupId}
        onFixGtin={handleFixGtin}
        progressDone={progress.visible ? progress.items.filter((i) => i.status === "done" || i.status === "error").length : undefined}
        progressTotal={progress.visible ? progress.items.length : undefined}
      />

      <ProgressPanel
        visible={progress.visible}
        operation={progress.operation}
        items={progress.items}
        onClose={() => setProgress((p) => ({ ...p, visible: false }))}
      />

      {toast && (
        <div
          className={`fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium
            ${toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  valueClass,
  children,
}: {
  label: string;
  value: string | number;
  icon: string;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-bold text-gray-900 ${valueClass ?? ""}`}>{value}</div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
