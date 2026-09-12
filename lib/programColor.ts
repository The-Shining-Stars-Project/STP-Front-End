/**
 * Per-program colours derived from the program's own `colorHex`, for UI that must work
 * for ANY program — not just the three whose slugs have hand-written CSS tokens
 * (`--mjc`, `--pathways`, `--manteca`). A program created through the Programs page gets a
 * slug like `manteca-pt` or `summer-camp`; `var(--summer-camp-fill)` resolves to nothing,
 * which is why selected pills showed no highlight. Same recipe as the Skills Framework
 * page: flat tints mixed from the accent, no shadows.
 */
export function programTint(colorHex: string | undefined | null) {
  const hex = colorHex && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorHex) ? colorHex : "#6b6960";
  return {
    accent: hex,
    fill: `color-mix(in srgb, ${hex} 16%, var(--surface))`,
    // The selected border is the accent itself: a 45% mix read as "slightly greyer" next to
    // an unselected pill, which is why users reported the pills as not highlighting.
    border: `color-mix(in srgb, ${hex} 85%, var(--border))`,
    text: `color-mix(in srgb, ${hex} 72%, var(--fg))`,
  };
}

/** Inline style for a selectable program pill; `selected` switches to the program's tint. */
export function programPillStyle(colorHex: string | undefined | null, selected: boolean): React.CSSProperties {
  const t = programTint(colorHex);
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
    borderRadius: "var(--r-pill)", cursor: "pointer", fontSize: 13,
    border: `${selected ? "1px" : "0.5px"} solid ${selected ? t.border : "var(--border)"}`,
    background: selected ? t.fill : "var(--surface)",
    color: selected ? t.text : "var(--fg-secondary)",
    fontWeight: selected ? 500 : 400,
    // Keep the box the same size whether or not the 1px selected border is on.
    margin: selected ? 0 : "0.5px",
  };
}
