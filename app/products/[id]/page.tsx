"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import type { EnrichedProduct, AIModel, GeneratedContent, SyncPayload } from "@/types";
import { FieldEditor } from "@/components/FieldEditor";
import { GeneratePanel } from "@/components/GeneratePanel";
import { HealthBadge, ScoreGrid } from "@/components/HealthBadge";
import { computeHealth, validateSeoTitle, validateSeoDescription, validateUrlHandle, validateGtin, validateGoogleCondition } from "@/lib/validators";
import {
  ArrowLeft, Upload, Loader2, AlertCircle, CheckCircle2, ShoppingBag,
  ExternalLink, Globe, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "seo" | "google" | "description";

const GOOGLE_CONDITION_OPTIONS = ["", "new", "used", "refurbished"];
const GOOGLE_AGE_OPTIONS = ["", "newborn", "infant", "toddler", "kids", "adult"];
const GOOGLE_GENDER_OPTIONS = ["", "male", "female", "unisex"];

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<EnrichedProduct | null>(null);
  const [edited, setEdited] = useState<Partial<EnrichedProduct>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("seo");
  const [model, setModel] = useState<AIModel>("claude");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/shopify/products?id=${id}`);
        const data = await res.json() as { products?: EnrichedProduct[]; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? "Erreur de chargement");
        const found = data.products?.find((p) => p.shopify.id === Number(id));
        if (!found) throw new Error("Produit introuvable");
        setProduct(found);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const current = product ? { ...product, ...edited } : null;
  const health = current ? computeHealth(current as EnrichedProduct) : null;

  const setField = <K extends keyof EnrichedProduct>(key: K, value: EnrichedProduct[K]) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerated = (content: Partial<GeneratedContent>, _mode: "full" | "seo" | "google") => {
    setEdited((prev) => ({ ...prev, ...content }));
    showToast("Contenu généré avec succès !");
  };

  const handleSync = async () => {
    if (!current || !product) return;
    setSyncing(true);
    try {
      const payload: SyncPayload = {
        productId: product.shopify.id,
        fields: {
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          urlHandle: current.urlHandle,
          description: current.description,
          googleCategory: current.googleCategory,
          googleCondition: current.googleCondition,
          googleAgeGroup: current.googleAgeGroup,
          googleGender: current.googleGender,
          googleGtin: current.googleGtin,
          googleMpn: current.googleMpn,
          googleBrand: current.googleBrand,
          googleColor: current.googleColor,
          googleMaterial: current.googleMaterial,
          googleSize: current.googleSize,
          googlePattern: current.googlePattern,
          googleItemGroupId: current.googleItemGroupId,
        },
      };

      const res = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error);
      setProduct(current as EnrichedProduct);
      setEdited({});
      showToast("Synchronisé avec Shopify !");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erreur de synchronisation", "error");
    } finally {
      setSyncing(false);
    }
  };

  const hasChanges = Object.keys(edited).length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Chargement du produit...</p>
        </div>
      </div>
    );
  }

  if (error || !current) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 font-medium">{error ?? "Produit introuvable"}</p>
          <Link href="/" className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800">
            <ArrowLeft className="w-4 h-4" /> Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  const p = current.shopify;
  const img = p.images?.[0]?.src;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <ShoppingBag className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">{p.title}</h1>
            <p className="text-xs text-gray-400">{p.vendor} · {p.product_type}</p>
          </div>
          {health && <ScoreGrid seoScore={health.seoScore} googleScore={health.googleScore} />}
          {health && <HealthBadge score={health.score} label="Global" size="md" />}

          <a
            href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN ?? "store.myshopify.com"}/products/${p.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 px-2 py-1 rounded-lg hover:border-blue-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Voir sur boutique
          </a>

          <button
            onClick={handleSync}
            disabled={syncing || !hasChanges}
            className={cn(
              "flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors",
              hasChanges
                ? "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {hasChanges ? "Synchroniser Shopify" : "Aucune modification"}
          </button>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: product info */}
        <div className="flex flex-col gap-4">
          {/* Product card */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {img ? (
              <Image
                src={img}
                alt={p.title}
                width={400}
                height={300}
                className="w-full aspect-square object-cover"
              />
            ) : (
              <div className="w-full aspect-square bg-gray-100 flex items-center justify-center text-gray-300">
                Pas d&apos;image
              </div>
            )}
            <div className="p-4">
              <h2 className="font-semibold text-gray-900">{p.title}</h2>
              <p className="text-sm text-gray-500 mt-1">{p.vendor}</p>
              <div className="flex gap-2 mt-2">
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  p.status === "active" ? "bg-green-100 text-green-700" :
                  p.status === "draft" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {p.status === "active" ? "Actif" : p.status === "draft" ? "Brouillon" : "Archivé"}
                </span>
                {p.product_type && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    {p.product_type}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Variants */}
          {p.variants.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Variantes ({p.variants.length})</h3>
              <div className="flex flex-col gap-2">
                {p.variants.slice(0, 5).map((v) => (
                  <div key={v.id} className="flex justify-between text-xs text-gray-600">
                    <span className="truncate">{v.title}</span>
                    <span className="font-medium text-gray-900 ml-2">{v.price}€</span>
                  </div>
                ))}
                {p.variants.length > 5 && (
                  <p className="text-xs text-gray-400">+{p.variants.length - 5} autres variantes</p>
                )}
              </div>
            </div>
          )}

          {/* Health details */}
          {health && health.missingFields.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Champs manquants
              </h3>
              <ul className="flex flex-col gap-1">
                {health.missingFields.map((f) => (
                  <li key={f} className="text-xs text-red-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {health && health.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-yellow-700 mb-2">Avertissements</h3>
              <ul className="flex flex-col gap-1">
                {health.warnings.map((w) => (
                  <li key={w} className="text-xs text-yellow-700">{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column: editor */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Generate panel */}
          <GeneratePanel
            product={current as EnrichedProduct}
            model={model}
            onModelChange={setModel}
            onGenerated={handleGenerated}
          />

          {/* Tabs */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex border-b border-gray-200">
              {([
                { key: "seo", label: "SEO", icon: Globe },
                { key: "google", label: "Google Merchant", icon: Tag },
                { key: "description", label: "Description", icon: ShoppingBag },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                    tab === key
                      ? "border-blue-600 text-blue-700 bg-blue-50/50"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {key === "seo" && health && health.seoScore < 100 && (
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                  )}
                  {key === "google" && health && health.googleScore < 100 && (
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6 flex flex-col gap-5">
              {/* SEO Tab */}
              {tab === "seo" && (
                <>
                  <FieldEditor
                    label="Meta Title SEO"
                    value={current.seoTitle}
                    onChange={(v) => setField("seoTitle", v)}
                    maxLength={60}
                    minLength={20}
                    placeholder="Titre optimisé pour les moteurs de recherche..."
                    error={validateSeoTitle(current.seoTitle).error}
                    warning={validateSeoTitle(current.seoTitle).warning}
                    hint="Idéalement 40-60 caractères. Inclure le mot-clé principal."
                  />
                  <FieldEditor
                    label="Meta Description SEO"
                    value={current.seoDescription}
                    onChange={(v) => setField("seoDescription", v)}
                    maxLength={160}
                    minLength={50}
                    multiline
                    rows={3}
                    placeholder="Description engageante pour les résultats de recherche..."
                    error={validateSeoDescription(current.seoDescription).error}
                    warning={validateSeoDescription(current.seoDescription).warning}
                    hint="Idéalement 120-160 caractères. Inclure un appel à l'action."
                  />
                  <FieldEditor
                    label="URL Handle"
                    value={current.urlHandle}
                    onChange={(v) => setField("urlHandle", v)}
                    placeholder="nom-du-produit-en-tirets"
                    error={validateUrlHandle(current.urlHandle).error}
                    hint="Uniquement lettres minuscules, chiffres et tirets. Pas d'accents."
                  />

                  {/* SEO Preview */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Aperçu Google</p>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm text-gray-400 truncate">
                        https://example.com/products/<span className="text-gray-600">{current.urlHandle || "url-produit"}</span>
                      </p>
                      <p className="text-base text-blue-700 font-medium line-clamp-1">
                        {current.seoTitle || "Titre SEO non défini"}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {current.seoDescription || "Description meta non définie..."}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Google Merchant Tab */}
              {tab === "google" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FieldEditor
                    label="Catégorie Google"
                    value={current.googleCategory}
                    onChange={(v) => setField("googleCategory", v)}
                    placeholder="Vêtements > Hauts > T-shirts"
                    error={!current.googleCategory ? "Requis pour Google Shopping" : undefined}
                    hint="Catégorie Google Product Taxonomy"
                  />
                  <FieldEditor
                    label="Marque"
                    value={current.googleBrand}
                    onChange={(v) => setField("googleBrand", v)}
                    placeholder="Nom de la marque"
                    error={!current.googleBrand ? "Requis" : undefined}
                  />

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Condition</label>
                    <select
                      value={current.googleCondition}
                      onChange={(e) => setField("googleCondition", e.target.value as EnrichedProduct["googleCondition"])}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300",
                        !current.googleCondition ? "border-red-400" : "border-gray-300"
                      )}
                    >
                      {GOOGLE_CONDITION_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v === "" ? "— Sélectionner —" : v === "new" ? "Neuf" : v === "used" ? "Occasion" : "Reconditionné"}
                        </option>
                      ))}
                    </select>
                    {validateGoogleCondition(current.googleCondition).error && (
                      <p className="text-xs text-red-600">{validateGoogleCondition(current.googleCondition).error}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Tranche d&apos;âge</label>
                    <select
                      value={current.googleAgeGroup}
                      onChange={(e) => setField("googleAgeGroup", e.target.value as EnrichedProduct["googleAgeGroup"])}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      {GOOGLE_AGE_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v === "" ? "— Sélectionner —" : v === "newborn" ? "Nouveau-né" : v === "infant" ? "Nourrisson" : v === "toddler" ? "Bambin" : v === "kids" ? "Enfant" : "Adulte"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Genre</label>
                    <select
                      value={current.googleGender}
                      onChange={(e) => setField("googleGender", e.target.value as EnrichedProduct["googleGender"])}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      {GOOGLE_GENDER_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v === "" ? "— Sélectionner —" : v === "male" ? "Homme" : v === "female" ? "Femme" : "Mixte"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <FieldEditor
                    label="GTIN / EAN / UPC"
                    value={current.googleGtin}
                    onChange={(v) => setField("googleGtin", v)}
                    placeholder="3614272000000"
                    error={validateGtin(current.googleGtin).error}
                    warning={validateGtin(current.googleGtin).warning}
                    hint="Code-barres 8, 12, 13 ou 14 chiffres"
                  />
                  <FieldEditor
                    label="MPN (Réf. fabricant)"
                    value={current.googleMpn}
                    onChange={(v) => setField("googleMpn", v)}
                    placeholder="REF-12345"
                    hint="Référence interne fabricant"
                  />
                  <FieldEditor
                    label="Couleur"
                    value={current.googleColor}
                    onChange={(v) => setField("googleColor", v)}
                    placeholder="Bleu marine"
                  />
                  <FieldEditor
                    label="Matière"
                    value={current.googleMaterial}
                    onChange={(v) => setField("googleMaterial", v)}
                    placeholder="Coton bio"
                  />
                  <FieldEditor
                    label="Taille"
                    value={current.googleSize}
                    onChange={(v) => setField("googleSize", v)}
                    placeholder="M, L, XL / 42 / 38"
                  />
                  <FieldEditor
                    label="Motif"
                    value={current.googlePattern}
                    onChange={(v) => setField("googlePattern", v)}
                    placeholder="Uni, rayé, imprimé..."
                  />
                  <FieldEditor
                    label="ID Groupe d&apos;articles"
                    value={current.googleItemGroupId}
                    onChange={(v) => setField("googleItemGroupId", v)}
                    placeholder="ID commun aux variantes"
                    hint="Même ID pour toutes les variantes d'un même produit"
                  />
                </div>
              )}

              {/* Description Tab */}
              {tab === "description" && (
                <>
                  <FieldEditor
                    label="Description produit (HTML)"
                    value={current.description}
                    onChange={(v) => setField("description", v)}
                    multiline
                    rows={15}
                    placeholder="<p>Description complète du produit en français...</p>"
                    hint="Supporte le HTML. Idéalement 200-500 mots avec des mots-clés naturels."
                    error={(!current.description || current.description.trim() === "") ? "Description requise" : undefined}
                  />

                  {/* HTML Preview */}
                  {current.description && (
                    <div className="border border-gray-200 rounded-lg">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2 border-b border-gray-100">
                        Aperçu
                      </p>
                      <div
                        className="prose prose-sm max-w-none px-4 py-3 text-gray-700"
                        dangerouslySetInnerHTML={{ __html: current.description }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Save reminder */}
          {hasChanges && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800 font-medium">
                Vous avez des modifications non synchronisées
              </p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Synchroniser
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium
            ${toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
