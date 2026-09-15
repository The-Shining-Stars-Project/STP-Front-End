/**
 * Suggested t-shirt sizes. The field is free text (client ask, Sep 2026: "just write in the
 * sizes so we are not limited"); these only feed the drop-down suggestions, youth through 5XL.
 */
export const T_SHIRT_SIZES = ["YXS", "YS", "YM", "YL", "YXL", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] as const;

/** Kept for any caller still rendering a <select>: the suggestions plus the current value. */
export function sizeOptions(current: string | null | undefined): string[] {
  const list: string[] = [...T_SHIRT_SIZES];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}
