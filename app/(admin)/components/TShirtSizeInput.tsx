"use client";

import { useId } from "react";
import { T_SHIRT_SIZES } from "@/lib/tshirtSizes";

/**
 * Free-text size with suggestions (youth sizes through 5XL). Anything can be typed — the
 * list is a shortcut, not a limit. 20 characters, matching the API.
 */
export default function TShirtSizeInput({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const listId = useId();
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        maxLength={20}
        placeholder="e.g. YM, M, 3XL"
        onChange={(e) => onChange(e.target.value)}
        style={style}
      />
      <datalist id={listId}>
        {T_SHIRT_SIZES.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}
