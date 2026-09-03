"use client";

import { useMemo } from "react";
import { usePrograms } from "@/lib/api/hooks";

/**
 * Publishes every program's colour as the CSS custom properties and slug-keyed class rules
 * the rest of the admin UI already uses: `var(--<slug>)`, `--<slug>-fill`, `--<slug>-text`,
 * `--<slug>-border`, and `.ss-dot.<slug>`, `.ss-chip.is-active.<slug>`, `.ss-program.<slug>`,
 * `.ss-progress-fill.<slug>`, `.evt.<slug>`, `.bar.<slug>`.
 *
 * tokens.css hand-writes those for the three original slugs (mjc, pathways, manteca). A
 * program created on the Programs page gets a slug generated from its name — "manteca-pt",
 * "summer-camp" — and every one of those usages silently resolved to nothing: grey dots, no
 * pill highlight, unfilled attendance bars. Deriving the set from each program's own
 * `colorHex` makes the colour chosen on the Programs page the colour everywhere, for any
 * slug. Rendered once in the admin layout; the programs query is cached and shared.
 */
export default function ProgramTheme() {
  const programs = usePrograms().data;

  const css = useMemo(() => {
    const vars: string[] = [];
    const rules: string[] = [];
    for (const p of programs ?? []) {
      // Slugs are generated from names; only emit ones that are safe as CSS identifiers.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug)) continue;
      if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.colorHex)) continue;
      const s = p.slug;
      const c = p.colorHex;
      vars.push(
        `--${s}: ${c};`,
        `--${s}-fill: color-mix(in srgb, ${c} 11%, var(--surface));`,
        `--${s}-text: color-mix(in srgb, ${c} 65%, var(--fg));`,
        `--${s}-border: color-mix(in srgb, ${c} 50%, var(--border));`,
      );
      rules.push(
        `.ss-dot.${s} { background: var(--${s}); }`,
        `.ss-chip.is-active.${s} { background: var(--${s}-fill); color: var(--${s}-text); border-color: var(--${s}-border); }`,
        `.ss-program.${s} { background: var(--${s}-fill); color: var(--${s}-text); }`,
        `.ss-progress-fill.${s} { background: var(--${s}); }`,
        `.evt.${s} { background: var(--${s}-fill); color: var(--${s}-text); }`,
        `.bar.${s} { background: var(--${s}); }`,
      );
    }
    if (vars.length === 0) return "";
    return `:root {\n  ${vars.join("\n  ")}\n}\n${rules.join("\n")}\n`;
  }, [programs]);

  if (!css) return null;
  return <style id="program-theme">{css}</style>;
}
