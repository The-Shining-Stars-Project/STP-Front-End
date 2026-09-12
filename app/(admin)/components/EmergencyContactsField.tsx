"use client";

import { Plus, X } from "lucide-react";

/** Server cap (ParticipantLimits.EmergencyContactsMax). */
export const EMERGENCY_CONTACTS_MAX = 5;

/** Trims each entry and drops blanks — what actually gets sent. */
export function cleanContacts(draft: string[]): string[] {
  return draft.map((c) => c.trim()).filter((c) => c.length > 0).slice(0, EMERGENCY_CONTACTS_MAX);
}

/** A draft always shows at least one input, so an empty list is still editable. */
export function draftFromContacts(contacts: readonly string[]): string[] {
  return contacts.length > 0 ? [...contacts] : [""];
}

/**
 * Up to five free-text emergency contacts — name and phone in the one field, the way the
 * intake sheet records them ("Maria Rivera – (209) 555-0100"). Optional throughout.
 */
export function EmergencyContactsField({
  value,
  onChange,
  inputStyle,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  inputStyle: React.CSSProperties;
}) {
  const rows = value.length > 0 ? value : [""];

  function setRow(i: number, text: string) {
    const next = [...rows];
    next[i] = text;
    onChange(next);
  }
  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : [""]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            value={c}
            maxLength={300}
            placeholder={i === 0 ? "e.g. Maria Rivera – (209) 555-0100" : "Name – phone"}
            aria-label={`Emergency contact ${i + 1}`}
            onChange={(e) => setRow(i, e.target.value)}
            style={inputStyle}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label={`Remove emergency contact ${i + 1}`}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, display: "inline-flex", flexShrink: 0 }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      ))}
      {rows.length < EMERGENCY_CONTACTS_MAX && (
        <button
          type="button"
          className="ss-btn"
          onClick={() => onChange([...rows, ""])}
          style={{ alignSelf: "flex-start" }}
        >
          <Plus className="ss-btn-icon" />Add contact
        </button>
      )}
    </div>
  );
}

/** Read-only rendering: one line per contact, or a dash. */
export function EmergencyContactsView({ contacts }: { contacts: readonly string[] }) {
  if (contacts.length === 0) return <>—</>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
      {contacts.map((c, i) => (
        <li key={i} style={{ overflowWrap: "anywhere" }}>{c}</li>
      ))}
    </ul>
  );
}
