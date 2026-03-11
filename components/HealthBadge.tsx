"use client";

import { cn } from "@/lib/utils";

interface HealthBadgeProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
}

export function HealthBadge({ score, label, size = "md", showBar = false }: HealthBadgeProps) {
  const color =
    score >= 80
      ? "text-green-700 bg-green-100 border-green-200"
      : score >= 50
      ? "text-yellow-700 bg-yellow-100 border-yellow-200"
      : "text-red-700 bg-red-100 border-red-200";

  const barColor =
    score >= 80 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";

  const sizeClass =
    size === "sm" ? "text-xs px-1.5 py-0.5" : size === "lg" ? "text-base px-3 py-1" : "text-sm px-2 py-0.5";

  return (
    <div className="flex flex-col gap-1">
      <span className={cn("inline-flex items-center gap-1 rounded-full border font-semibold", color, sizeClass)}>
        {score >= 80 ? "●" : score >= 50 ? "◐" : "○"} {score}%{label ? ` ${label}` : ""}
      </span>
      {showBar && (
        <div className="h-1.5 w-full rounded-full bg-gray-200">
          <div
            className={cn("h-1.5 rounded-full transition-all", barColor)}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface ScoreGridProps {
  seoScore: number;
  googleScore: number;
}

export function ScoreGrid({ seoScore, googleScore }: ScoreGridProps) {
  return (
    <div className="flex gap-2">
      <HealthBadge score={seoScore} label="SEO" size="sm" />
      <HealthBadge score={googleScore} label="Google" size="sm" />
    </div>
  );
}
