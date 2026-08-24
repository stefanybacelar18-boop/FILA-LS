/** Casa concessionária Chronus por código, ou por nome+cidade se o cadastro ainda não tem código. */

export function foldDealerText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function dealerNameCityKey(name: string, city: string): string {
  return `${foldDealerText(name)}|${foldDealerText(city)}`;
}

export type ChronusDealerMatchInput = {
  id: string;
  code: string | null;
  name: string;
  city: string;
};

export function buildChronusDealerIndexes<T extends ChronusDealerMatchInput>(dealers: T[]): {
  byCode: Map<string, T>;
  byNameCity: Map<string, T>;
} {
  const byCode = new Map<string, T>();
  const byNameCity = new Map<string, T>();
  for (const dealer of dealers) {
    if (dealer.code?.trim()) byCode.set(dealer.code.trim(), dealer);
    const key = dealerNameCityKey(dealer.name, dealer.city);
    const existing = byNameCity.get(key);
    if (!existing || (!existing.code && dealer.code)) byNameCity.set(key, dealer);
  }
  return { byCode, byNameCity };
}

export function matchChronusDealership<T extends ChronusDealerMatchInput>(
  sample: { dealerCode: string; dealerName: string; city: string },
  indexes: { byCode: Map<string, T>; byNameCity: Map<string, T> },
): T | undefined {
  const code = sample.dealerCode?.trim();
  if (code) {
    const hit = indexes.byCode.get(code);
    if (hit) return hit;
  }
  if (!sample.dealerName?.trim() || !sample.city?.trim()) return undefined;
  return indexes.byNameCity.get(dealerNameCityKey(sample.dealerName, sample.city));
}

export function normalizeDealershipRegion(raw: string): string {
  const value = raw.trim().replace(/\s+/g, ' ');
  const onlyNumber = value.match(/^(\d{1,2})$/);
  if (onlyNumber) return `Região ${onlyNumber[1]}`;
  const already = value.match(/^região\s+(\d{1,2})$/i);
  if (already) return `Região ${already[1]}`;
  return value;
}
