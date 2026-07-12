/** TypeORM devuelve bigint como string; lo normalizamos a number en centavos. */
export const bigintToCents = {
  to: (value: number): string => String(value ?? 0),
  from: (value: string | null): number =>
    value == null ? 0 : parseInt(value, 10),
};

export const dollarsToCents = (dollars: number): number =>
  Math.round(dollars * 100);

export const centsToDollars = (cents: number): number => cents / 100;
