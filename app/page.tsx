"use client";

import { useEffect, useState, useCallback } from "react";
import type { EnrichedProduct, FilterState, AIModel, GeneratedContent, SyncPayload } from "@/types";
import { ProductTable } from "@/components/ProductTable";
import { ProductFilters } from "@/components/ProductFilters";
import { BulkActionBar } from "@/components/BulkActionBar";
import { HealthBadge } from "@/components/HealthBadge";
import { RefreshCw, ShoppingBag, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { computeHealth } from "@/lib/validators";

const DEFAULT_FILTERS: FilterState = {
  search: "",
  healthMin: 0,
  healthMax: 100,
  missingType: "all",
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

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEnriching(false);
    setEnrichProgress(0);
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
      const batchSize = 10;
      let offset = 0;

      while (offset < total) {
        const r = await fetch(`/api/shopify/products?meta=true&offset=${offset}&limit=${batchSize}`);
        const d = await r.json() as { products?: EnrichedProduct[]; hasMore?: boolean; nextOffset?: number };
        if (d.products) {
          setProducts((prev) => {
            const updated = [...prev];
            d.products!.forEach((enriched) => {
              const idx = updated.findIndex((p) => p.shopify.id === enriched.shopify.id);
              if (idx !== -1) updated[idx] = enriched;
            });
            return updated;
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
              const updated = { ...p, ...data.generated };
              updated.health = computeHealth(updated);
              return updated;
            })
          );
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
    let success = 0;
    let failed = 0;
    let lastError = "";
    const generated: EnrichedProduct[] = [];

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
          const updated = { ...product, ...data.generated };
          updated.health = computeHealth(updated);
          generated.push(updated);
          setProducts((prev) => prev.map((p) => p.shopify.id === id ? updated : p));
          success++;
        } else {
          lastError = data.error ?? "Erreur inconnue";
          failed++;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Erreur réseau";
        failed++;
      }
    }

    if (generated.length === 0) {
      showToast(`Génération échouée : ${lastError}`, "error");
      return;
    }

    // Sync using freshly generated data (no stale closure issue)
    const payloads: SyncPayload[] = generated.map((p) => ({
      productId: p.shopify.id,
      fields: {
        seoTitle: p.seoTitle, seoDescription: p.seoDescription, urlHandle: p.urlHandle,
        description: p.description, googleCategory: p.googleCategory, googleCondition: p.googleCondition,
        googleAgeGroup: p.googleAgeGroup, googleGender: p.googleGender, googleGtin: p.googleGtin,
        googleMpn: p.googleMpn, googleBrand: p.googleBrand, googleColor: p.googleColor,
        googleMaterial: p.googleMaterial, googleSize: p.googleSize, googlePattern: p.googlePattern,
        googleItemGroupId: p.googleItemGroupId,
      },
    }));

    try {
      const res = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payloads }),
      });
      const data = await res.json() as { success?: number; failed?: number };
      showToast(
        `Généré ${success} · Synchronisé ${data.success ?? 0}${(data.failed ?? 0) > 0 ? ` · ${data.failed} échoué(s)` : ""}`,
        (data.failed ?? 0) > 0 || failed > 0 ? "error" : "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erreur de synchronisation", "error");
    }
  };

  const handleApplyCategory = async (ids: number[]) => {
    // Send only the fields needed for derivation — avoids 413 when selecting all products
    const slimProducts = products
      .filter((p) => ids.includes(p.shopify.id))
      .map((p) => ({
        id: p.shopify.id,
        vendor: p.shopify.vendor,
        tags: p.shopify.tags,
        options: p.shopify.options ?? [],
        firstVariantSku: p.shopify.variants?.[0]?.sku ?? "",
        firstVariantBarcode: p.shopify.variants?.[0]?.barcode ?? "",
      }));
    try {
      const res = await fetch("/api/shopify/apply-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: slimProducts }),
      });
      const data = await res.json() as {
        applied: number;
        skipped: number;
        failed: number;
        results: Array<{ productId: number; fields: Record<string, string>; status: string }>;
      };

      if (data.results) {
        setProducts((prev) =>
          prev.map((p) => {
            const result = data.results.find((r) => r.productId === p.shopify.id);
            if (!result || result.status !== "applied") return p;
            const updated = { ...p, ...result.fields };
            updated.health = computeHealth(updated);
            return updated;
          })
        );
      }

      const parts: string[] = [];
      if (data.applied > 0) parts.push(`${data.applied} appliqué${data.applied > 1 ? "s" : ""}`);
      if (data.skipped > 0) parts.push(`${data.skipped} ignoré${data.skipped > 1 ? "s" : ""}`);
      if (data.failed > 0) parts.push(`${data.failed} échoué${data.failed > 1 ? "s" : ""}`);
      showToast(`Champs catégorie : ${parts.join(", ")}`, data.failed > 0 ? "error" : "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erreur", "error");
    }
  };

  const handleBulkSync = async (ids: number[]) => {
    const payloads: SyncPayload[] = ids.map((id) => {
      const p = products.find((pr) => pr.shopify.id === id)!;
      return {
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
    });

    try {
      const res = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payloads }),
      });
      const data = await res.json() as { success?: number; failed?: number; errors?: string[] };
      showToast(
        `Synchronisé : ${data.success ?? 0} réussi${(data.success ?? 0) > 1 ? "s" : ""}${(data.failed ?? 0) > 0 ? `, ${data.failed} échoué${(data.failed ?? 0) > 1 ? "s" : ""}` : ""}`,
        (data.failed ?? 0) > 0 ? "error" : "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erreur de synchronisation", "error");
    }
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
