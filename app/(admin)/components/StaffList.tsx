import React from "react";

/** `id` is the staff record id. Pass it when you have it: two staff can share a name. */
type Staff = { id?: string; nm: string; pct: number; fill: string };

export default function StaffList({ items }: { items: Staff[] }) {
  return (
    <div>
      {items.map((s) => (
        <div className="staff-row" key={s.id ?? s.nm}>
          <div className="top">
            <span className="nm">{s.nm}</span>
            <span className="pct">{s.pct}%</span>
          </div>
          <div className="ss-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.pct} aria-label={`${s.nm} onboarding ${s.pct} percent complete`}>
            <div className={`ss-progress-fill ${s.fill}`} style={{ width: `${s.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
