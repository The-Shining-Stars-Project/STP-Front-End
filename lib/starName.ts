/** "Jordan Rivera (JJ)" when a preferred name is set, else the full name. */
export function starDisplayName(fullName: string, preferredName: string | null | undefined): string {
  const p = preferredName?.trim();
  return p && p.toLowerCase() !== fullName.trim().toLowerCase() ? `${fullName} (${p})` : fullName;
}
