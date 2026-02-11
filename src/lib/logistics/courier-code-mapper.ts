import "server-only";

import type { CourierCompany } from "@/types/settings";

export type TrackingMarketCode = "coupang" | "smartstore" | "11st" | "gmarket" | "auction";

interface ResolveInternalCodeInput {
  inputCourierCode: string | null | undefined;
  companies: CourierCompany[];
  defaultCourierCode?: string | null;
}

interface ToMarketCourierCodeInput extends ResolveInternalCodeInput {
  marketCode: TrackingMarketCode;
}

function normalizeCourierToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function getCompanyByCode(companies: CourierCompany[], code: string | null | undefined) {
  if (!code) return null;
  const normalized = normalizeCourierToken(code);
  return companies.find((company) => normalizeCourierToken(company.code) === normalized) ?? null;
}

function buildAliasMap(companies: CourierCompany[]) {
  const aliasMap = new Map<string, string>();

  function addAlias(alias: string | null | undefined, targetCode: string) {
    if (!alias) return;
    const normalized = normalizeCourierToken(alias);
    if (!normalized) return;
    aliasMap.set(normalized, targetCode);
  }

  for (const company of companies) {
    addAlias(company.code, company.code);
    addAlias(company.name, company.code);
    addAlias(company.coupangCode, company.code);
    addAlias(company.smartstoreCode, company.code);
    addAlias(company.eleventhCode, company.code);
    addAlias(company.gmarketCode, company.code);
  }

  // Frequently-seen aliases in uploaded tracking files.
  const manualAliases: Record<string, string[]> = {
    cj: ["cj", "cjgls", "cj대한통운", "대한통운"],
    lotte: ["lotte", "롯데", "롯데택배"],
    hanjin: ["hanjin", "한진", "한진택배"],
    post: ["post", "epost", "우체국", "우체국택배"],
    logen: ["logen", "로젠", "로젠택배"],
    cu: ["cu", "cupost", "cu편의점택배", "편의점택배"],
  };

  for (const [code, aliases] of Object.entries(manualAliases)) {
    if (!getCompanyByCode(companies, code)) continue;
    for (const alias of aliases) addAlias(alias, code);
  }

  return aliasMap;
}

function readMappedCode(company: CourierCompany, marketCode: TrackingMarketCode) {
  if (marketCode === "coupang") return company.coupangCode;
  if (marketCode === "smartstore") return company.smartstoreCode;
  if (marketCode === "11st") return company.eleventhCode;
  if (marketCode === "gmarket" || marketCode === "auction") return company.gmarketCode;
  return null;
}

export function resolveInternalCourierCode(input: ResolveInternalCodeInput): string | null {
  const aliasMap = buildAliasMap(input.companies);
  const raw = (input.inputCourierCode ?? "").trim();
  const normalized = raw ? normalizeCourierToken(raw) : "";

  if (normalized && aliasMap.has(normalized)) {
    return aliasMap.get(normalized) ?? null;
  }

  const fallback = (input.defaultCourierCode ?? "").trim();
  if (fallback && getCompanyByCode(input.companies, fallback)) {
    const normalizedFallback = normalizeCourierToken(fallback);
    for (const company of input.companies) {
      if (normalizeCourierToken(company.code) === normalizedFallback) {
        return company.code;
      }
    }
  }

  return null;
}

export function toStorageCourierCode(input: ResolveInternalCodeInput): string | null {
  const internal = resolveInternalCourierCode(input);
  if (internal) return internal;

  const raw = (input.inputCourierCode ?? "").trim();
  if (raw) return raw;

  const fallback = (input.defaultCourierCode ?? "").trim();
  return fallback || null;
}

export function toMarketCourierCode(input: ToMarketCourierCodeInput): string {
  const internal = resolveInternalCourierCode(input);
  if (internal) {
    const company = getCompanyByCode(input.companies, internal);
    const mapped = company ? (readMappedCode(company, input.marketCode) ?? "").trim() : "";
    if (mapped) return mapped;
  }

  const raw = (input.inputCourierCode ?? "").trim();
  if (raw) return raw;

  const fallbackInternal = (input.defaultCourierCode ?? "").trim();
  if (fallbackInternal) {
    const company = getCompanyByCode(input.companies, fallbackInternal);
    if (company) {
      const mapped = (readMappedCode(company, input.marketCode) ?? "").trim();
      if (mapped) return mapped;
      return company.code;
    }
    return fallbackInternal;
  }

  // Legacy fallback (previous behavior)
  return "CJGLS";
}

