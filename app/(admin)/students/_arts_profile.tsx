"use client";

import { useEffect, useState } from "react";
import { describeApiError } from "@/lib/api/client";
import { Sparkles, Pencil, Check, Loader2 } from "lucide-react";
import { participantsApi } from "@/lib/api/participants";
import type { ParticipantArtsProfileDto, UpsertArtsProfileDto } from "@/lib/types/api";

const FIELDS: { key: keyof UpsertArtsProfileDto; label: string; placeholder: string }[] = [
  { key: "ippSummary", label: "Student IPP summary", placeholder: "Summary of the student's IPP…" },
  { key: "currentLevel", label: "Student current level", placeholder: "Narrative of present functioning — prompting needs, processing, communication…" },
  { key: "tsspArtsGoal", label: "Student TSSP arts goal", placeholder: "The measurable arts participation goal…" },
];

const textareaStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "8px 12px", fontSize: 13, color: "var(--fg)", background: "var(--surface)",
  outline: "none", resize: "vertical", lineHeight: "var(--lh-body)",
};

type Form = { ippSummary: string; currentLevel: string; tsspArtsGoal: string };

function formFrom(p: ParticipantArtsProfileDto | null): Form {
  return {
    ippSummary: p?.ippSummary ?? "",
    currentLevel: p?.currentLevel ?? "",
    tsspArtsGoal: p?.tsspArtsGoal ?? "",
  };
}

export default function ArtsProfileWidget({ participantId }: { participantId: string }) {
  const [profile, setProfile] = useState<ParticipantArtsProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>({ ippSummary: "", currentLevel: "", tsspArtsGoal: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    participantsApi.getArtsProfile(participantId)
      .then((p) => { if (active) { setProfile(p); setForm(formFrom(p)); } })
      .catch(() => { /* widget shows empty state */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [participantId]);

  function startEdit() { setForm(formFrom(profile)); setError(null); setEditing(true); }
  function cancelEdit() { setForm(formFrom(profile)); setError(null); setEditing(false); }

  async function save() {
    setSaving(true);
    setError(null);
    const dto: UpsertArtsProfileDto = {
      ippSummary: form.ippSummary.trim() || null,
      currentLevel: form.currentLevel.trim() || null,
      tsspArtsGoal: form.tsspArtsGoal.trim() || null,
    };
    try {
      const saved = await participantsApi.upsertArtsProfile(participantId, dto);
      setProfile(saved);
      setForm(formFrom(saved));
      setEditing(false);
    } catch (err) {
      setError(describeApiError(err, "Couldn't save the arts profile — try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="widget">
      <div className="widget-head" style={{ display: "flex", alignItems: "center" }}>
        <Sparkles className="ico" style={{ color: "var(--primary)" }} />
        <h3>Arts profile</h3>
        <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)", marginLeft: 8 }}>Student Frame</span>
        {!loading && !editing && (
          <button type="button" onClick={startEdit} className="ss-btn" style={{ marginLeft: "auto" }}>
            <Pencil className="ss-btn-icon" />Edit
          </button>
        )}
        {editing && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" className="ss-btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
            <button type="button" className="ss-btn ss-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="widget-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {loading ? (
          <div style={{ padding: "8px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {error && <div style={{ fontSize: "var(--fs-meta)", color: "var(--danger-text)" }}>{error}</div>}
            {!editing && !profile?.hasProfile && (
              <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>
                No arts profile yet — <button type="button" onClick={startEdit} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: 13, padding: 0 }}>add the Student Frame</button>.
              </div>
            )}
            {FIELDS.map((f) => {
              const value = form[f.key as keyof Form];
              const view = (profile?.[f.key] as string | null | undefined) || null;
              if (!editing && !view) return null; // hide empty fields in view mode
              return (
                <div key={f.key}>
                  <div className="ss-label" style={{ marginBottom: 6 }}>{f.label}</div>
                  {editing ? (
                    <textarea
                      value={value}
                      rows={f.key === "ippSummary" ? 2 : 3}
                      placeholder={f.placeholder}
                      onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      style={textareaStyle}
                    />
                  ) : (
                    <div style={{ fontSize: 14, color: "var(--fg)", lineHeight: "var(--lh-body)", whiteSpace: "pre-wrap" }}>{view}</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
