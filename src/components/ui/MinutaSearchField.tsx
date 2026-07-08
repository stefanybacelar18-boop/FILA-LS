"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MinutaSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
};

/** Campo de busca por minuta — mobile e fila pública. */
export function MinutaSearchField({
  value,
  onChange,
  placeholder = "Buscar minuta…",
  className,
  id = "minuta-search",
}: MinutaSearchFieldProps) {
  return (
    <div className={cn("minuta-search", className)}>
      <Search className="minuta-search__icon" aria-hidden />
      <input
        id={id}
        type="search"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="minuta-search__input"
        aria-label="Buscar minuta"
      />
      {value.trim() && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="minuta-search__clear"
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
