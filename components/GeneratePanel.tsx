"use client";

import { useState } from "react";
import type { EnrichedProduct, AIModel, GeneratedContent } from "@/types";
import { Zap, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneratePanelProps {
  product: EnrichedProduct;
  model: AIModel;
  onModelChange: (m: AIModel) => void;
  onGenerated: (content: Partial<GeneratedContent>, mode: "full" | "seo" | "google") => void;
}

type Mode = "full" | "seo" | "google";
const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: "full", label: "Tout générer", desc: "SEO + Google Merchant" },
  { value: "seo", label: "SEO uniquement", desc: "Titre, description, URL" },
  { value: "google", label: "Google uniquement", desc: "Champs Google Merchant" },
];

export function GeneratePanel({ product, model, onModelChange, onGenerated }: GeneratePanelProps) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("full");
  const [modeOpen, setModeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, model, mode }),
      });
      const data = await res.json() as { generated?: Partial<GeneratedContent>; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Erreur de génération");
        return;
      }
      if (data.generated) {
        onGenerated(data.generated, mode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const currentMode = MODES.find((m) => m.value === mode)!;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-800">Génération IA</span>
        </div>

        {/* Model selector */}
        <div className="flex gap-1 bg-white rounded-lg border border-blue-200 p-0.5">
          {(["claude", "openai"] as AIModel[]).map((m) => (
            <button
              key={m}
              onClick={() => onModelChange(m)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                model === m
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              )}
            >
              {m === "claude" ? "Claude" : "GPT-4o"}
            </button>
          ))}
        </div>

        {/* Mode selector */}
        <div className="relative">
          <button
            onClick={() => setModeOpen(!modeOpen)}
            className="flex items-center gap-2 bg-white border border-blue-200 px-3 py-1.5 rounded-lg text-sm hover:border-blue-400 transition-colors"
          >
            <span className="font-medium">{currentMode.label}</span>
            <span className="text-xs text-gray-400">{currentMode.desc}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {modeOpen && (
            <div className="absolute top-full mt-1 left-0 bg-white rounded-xl border border-gray-200 shadow-lg z-10 min-w-[200px] overflow-hidden">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => { setMode(m.value); setModeOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors",
                    mode === m.value && "bg-blue-50"
                  )}
                >
                  <div className={cn("text-sm font-medium", mode === m.value ? "text-blue-700" : "text-gray-800")}>
                    {m.label}
                  </div>
                  <div className="text-xs text-gray-400">{m.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm px-5 py-2 rounded-lg transition-colors shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Génération...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Générer
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
