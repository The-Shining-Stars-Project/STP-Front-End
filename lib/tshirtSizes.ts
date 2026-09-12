/**
 * Star t-shirt sizes, 2XS through 5XL (client ask, Sep 2026). Youth sizes were dropped — the
 * stars are adults — but `sizeOptions` keeps whatever an existing record already holds so an
 * old "YM" is still visible and selectable rather than silently blanked on the next save.
 */
export const T_SHIRT_SIZES = ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] as const;

export function sizeOptions(current: string | null | undefined): string[] {
  const list: string[] = [...T_SHIRT_SIZES];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}
