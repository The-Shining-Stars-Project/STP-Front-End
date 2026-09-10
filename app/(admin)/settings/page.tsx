"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Drama,
  Target,
  CalendarRange,
  UserCog,
  UserCheck,
  Users,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { usePrograms, useReferenceLists } from "@/lib/api/hooks";
import SitesEditor from "./_sites";
import type { ProgramSummaryDto, ReferenceListsDto } from "@/lib/types/api";

// ── Management surfaces ─────────────────────────────────────────────────────────
// Settings is a hub: the real editing lives on the pages below. Each card is an
// honest "manage X → over there" link rather than duplicated CRUD.

type SettingsLink = { href: string; label: string; icon: LucideIcon; desc: string };

const CONFIG_LINKS: SettingsLink[] = [
  { href: "/programs",      label: "Programs",         icon: Drama,         desc: "Create and edit programs, assign staff, and set weekly schedules." },
  { href: "/skills",        label: "Skills Framework", icon: Target,        desc: "Objective areas and the sub-skills measured across every program." },
  { href: "/year-calendar", label: "Year Calendar",    icon: CalendarRange, desc: "Terms, holidays, and no-session days for the program year." },
];

const PEOPLE_LINKS: SettingsLink[] = [
  { href: "/users", label: "Users & Roles",    icon: UserCog,   desc: "Add teachers, coordinators, and admins; reset passwords and manage access." },
  { href: "/staff", label: "Staff Onboarding", icon: UserCheck, desc: "Edit the onboarding checklist template and track each member's progress." },
];

function LinkCard({ link }: { link: SettingsLink }) {
  const Icon = link.icon;
  return (
    <Link href={link.href} className="settings-card">
      <span className="ico-badge"><Icon /></span>
      <span className="body">
        <h3>{link.label}</h3>
        <p>{link.desc}</p>
      </span>
      <span className="go" aria-hidden="true"><ChevronRight /></span>
    </Link>
  );
}

function Section({ label, links }: { label: string; links: SettingsLink[] }) {
  return (
    <div className="settings-section">
      <div className="settings-eyebrow">{label}</div>
      <div className="settings-grid">
        {links.map((l) => <LinkCard key={l.href} link={l} />)}
      </div>
    </div>
  );
}

// ── Organization overview (read-only snapshot from real reference data) ──────────

function ChipRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <span
        className="ss-label"
        style={{ color: "var(--fg-tertiary)", display: "inline-flex", alignItems: "center", gap: 6, minWidth: 96 }}
      >
        {icon}{label}
      </span>
      <div className="settings-overview">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const programsQ = usePrograms();
  const listsQ = useReferenceLists();

  const programs: ProgramSummaryDto[] = programsQ.data ?? [];
  const lists: ReferenceListsDto | undefined = listsQ.data;
  const loading = programsQ.isPending || listsQ.isPending;

  const stat = (n: number | undefined) => (loading ? "…" : String(n ?? 0));

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Settings</h1>
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-2)" }}>
          <Sparkles />
          <span>
            Everything that shapes how the CRM works — programs, the skills framework,
            people and their roles, and onboarding. Editing happens on each area&apos;s own
            page; this is the map.
          </span>
        </div>

        {/* Organization at a glance */}
        <div className="board-stats">
          <div className="board-stat"><span className="num">{stat(programs.length)}</span><span className="label">Programs</span></div>
          <div className="board-stat"><span className="num">{stat(lists?.sites.length)}</span><span className="label">Sites</span></div>
          <div className="board-stat"><span className="num">{stat(lists?.starGroups.length)}</span><span className="label">Star Groups</span></div>
          <div className="board-stat"><span className="num">{stat(lists?.objectiveAreas.length)}</span><span className="label">Objective Areas</span></div>
        </div>

        <Section label="Programs & Curriculum" links={CONFIG_LINKS} />
        <Section label="People & Access" links={PEOPLE_LINKS} />

        {/* Read-only org configuration snapshot */}
        <div className="settings-section">
          <div className="settings-eyebrow">Organization</div>
          <div className="section" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {listsQ.isError ? (
              <p className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>
                Couldn&apos;t load organization details — check that the API is running.
              </p>
            ) : (
              <>
                <ChipRow icon={<Drama style={{ width: 12, height: 12 }} />} label="Programs">
                  {programs.length ? programs.map((p) => (
                    <span key={p.id} className="ss-chip ss-chip--static">
                      <span className={`ss-dot ${p.slug}`} />{p.name}
                    </span>
                  )) : <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>None yet</span>}
                </ChipRow>

                {/* Sites are the one thing edited here rather than on their own page: add,
                    rename, retire. Everything else on this page stays a map to elsewhere. */}
                <SitesEditor />

                <ChipRow icon={<Users style={{ width: 12, height: 12 }} />} label="Star Groups">
                  {lists?.starGroups.length ? lists.starGroups.map((g) => (
                    <span key={g.id} className="ss-chip ss-chip--static">{g.name}</span>
                  )) : <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>None yet</span>}
                </ChipRow>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
