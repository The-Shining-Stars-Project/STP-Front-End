"use client";

import { useState } from "react";
import { staffRoleLabel } from "@/lib/staffRoles";
import { useQueryClient } from "@tanstack/react-query";
import {
  UserPlus,
  ShieldCheck,
  User as UserIcon,
  CheckCircle2,
  X,
  Pencil,
  KeyRound,
  Trash2,
  ShieldOff,
  AlertTriangle,
} from "lucide-react";
import { useUsers, useStaff, queryKeys } from "@/lib/api/hooks";
import LoadError from "@/app/components/LoadError";
import { useAuth } from "@/lib/auth/AuthProvider";
import { initialsOf } from "@/lib/format";
import type {
  UserDto,
  StaffSummaryDto,
} from "@/lib/types/api";

import {
  CreateUserModal,
  EditUserModal,
  ResetPasswordModal,
  ResetMfaModal,
  DeleteUserModal,
  iconBtnStyle,
} from "./_modals";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { isAdmin, loading: authLoading, user: currentUser } = useAuth();

  // Cached via React Query (#34); the users query only runs for admins.
  const queryClient = useQueryClient();
  const usersQ = useUsers(!authLoading && isAdmin);
  const staffQ = useStaff();
  const users: UserDto[] = usersQ.data ?? [];
  const staff: StaffSummaryDto[] = staffQ.data ?? [];
  const loading = usersQ.isPending;
  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: queryKeys.users });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [resettingMfa, setResettingMfa] = useState<UserDto | null>(null);
  const [deleting, setDeleting] = useState<UserDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Non-admins never see the roster.
  if (!authLoading && !isAdmin) {
    return (
      <div className="adm-main">
        <div className="adm-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center", gap: 8 }}>
          <ShieldCheck style={{ width: 28, height: 28, color: "var(--fg-tertiary)" }} />
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Admins only</h2>
          <p style={{ fontSize: 13, color: "var(--fg-tertiary)", maxWidth: 320 }}>
            You need an administrator account to manage users.
          </p>
        </div>
      </div>
    );
  }

  const adminCount = users.filter((u) => u.role === "Admin").length;
  // Worth surfacing in the subtitle: while mandatory MFA is on, an unenrolled account is one
  // that cannot actually use the CRM yet.
  const unenrolledCount = users.filter((u) => !u.mfaEnabled).length;

  return (
    <>
      <div className="adm-main">
        <div className="adm-topbar">
          <div className="titles">
            <h1>Users</h1>
            <span className="date">
              {users.length} account{users.length === 1 ? "" : "s"} · {adminCount} admin{adminCount === 1 ? "" : "s"}
              {unenrolledCount > 0 && ` · ${unenrolledCount} without two-factor`}
            </span>
          </div>
          <div className="right">
            <button className="ss-btn ss-btn-primary" type="button" onClick={() => setModalOpen(true)}>
              <UserPlus className="ss-btn-icon" />
              Create user
            </button>
          </div>
        </div>

        <div className="adm-content">
          {notice && (
            <div className="ss-alert" style={{ marginBottom: "var(--space-4)", background: "var(--success-fill)", borderColor: "var(--success-border)", color: "var(--success-text)" }}>
              <CheckCircle2 />
              <span className="ss-alert-text">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", display: "inline-flex" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
          <div className="tbl-card">
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Staff record</th>
                    <th>Status</th>
                    <th>Two-factor</th>
                    <th style={{ width: 150, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>
                        Loading users…
                      </td>
                    </tr>
                  ) : usersQ.isError ? (
                    <tr>
                      <td colSpan={7}>
                        <LoadError
                          title="Couldn't load users"
                          error={usersQ.error}
                          onRetry={() => usersQ.refetch()}
                        />
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>
                        No users yet — create one to get started.
                      </td>
                    </tr>
                  ) : users.map((u) => {
                    const isMe = currentUser?.id === u.id;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="cell-student">
                            <span className={`ss-avatar sm ${u.role === "Admin" ? "admin" : "teacher"}`}>
                              {initialsOf(u.fullName)}
                            </span>
                            <div>
                              <div className="nm">
                                {u.fullName}
                                {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--fg-tertiary)" }}>(you)</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="ss-meta">{u.email}</td>
                        {/* A Staff account sees nothing until it is linked to a staff record
                            that is assigned to a program — make the missing link visible. */}
                        <td>
                          {u.staffMemberId ? (
                            <span className="ss-meta">
                              {staff.find((m) => m.id === u.staffMemberId)?.fullName ?? "Linked"}
                              {u.staffRole ? <span style={{ color: "var(--fg-tertiary)" }}> · {staffRoleLabel(u.staffRole)}</span> : null}
                            </span>
                          ) : u.role === "Admin" ? (
                            <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>—</span>
                          ) : (
                            <span className="ss-badge is-attention" title="Not linked: this login sees no stars, classes or rosters until it is linked to a staff record and that record is assigned to a program.">
                              <AlertTriangle />Not linked
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`ss-badge ${u.role === "Admin" ? "is-attention" : ""}`}>
                            {u.role === "Admin" ? <ShieldCheck /> : <UserIcon />}
                            {u.role}
                          </span>
                        </td>
                        <td>
                          {u.isActive ? (
                            <span className="ss-badge is-active"><CheckCircle2 />Active</span>
                          ) : (
                            <span className="ss-badge">Disabled</span>
                          )}
                        </td>
                        <td>
                          {u.mfaEnabled ? (
                            <span className="ss-badge is-active"><ShieldCheck />On</span>
                          ) : (
                            <span className="ss-badge is-attention">Not set up</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                            <button type="button" className="ss-icon-btn" title="Edit user"
                              onClick={() => setEditing(u)} style={iconBtnStyle}>
                              <Pencil style={{ width: 15, height: 15 }} />
                            </button>
                            <button type="button" className="ss-icon-btn" title="Reset password"
                              onClick={() => setResetting(u)} style={iconBtnStyle}>
                              <KeyRound style={{ width: 15, height: 15 }} />
                            </button>
                            {/* Only offered where there is something to clear — on an account with
                                no authenticator the endpoint succeeds and changes nothing. */}
                            <button type="button" className="ss-icon-btn"
                              title={u.mfaEnabled ? "Reset two-factor authentication" : "No authenticator to reset"}
                              onClick={() => setResettingMfa(u)} disabled={!u.mfaEnabled}
                              style={{ ...iconBtnStyle, opacity: u.mfaEnabled ? 1 : 0.4, cursor: u.mfaEnabled ? "pointer" : "not-allowed" }}>
                              <ShieldOff style={{ width: 15, height: 15 }} />
                            </button>
                            <button type="button" className="ss-icon-btn" title={isMe ? "You can't delete your own account" : "Delete user"}
                              onClick={() => setDeleting(u)} disabled={isMe}
                              style={{ ...iconBtnStyle, color: isMe ? "var(--fg-tertiary)" : "var(--danger)", opacity: isMe ? 0.4 : 1, cursor: isMe ? "not-allowed" : "pointer" }}>
                              <Trash2 style={{ width: 15, height: 15 }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tbl-foot">
              <span className="info">Showing {users.length} user{users.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <CreateUserModal
          staff={staff}
          onClose={() => setModalOpen(false)}
          onCreated={(u) => {
            refreshUsers();
            setNotice(`Created account for ${u.fullName}.`);
            setModalOpen(false);
          }}
        />
      )}

      {editing && (
        <EditUserModal
          target={editing}
          staff={staff}
          isSelf={currentUser?.id === editing.id}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            refreshUsers();
            setNotice(`Updated ${u.fullName}.`);
            setEditing(null);
          }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          target={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setNotice(`Password reset for ${resetting.fullName}.`);
            setResetting(null);
          }}
        />
      )}

      {resettingMfa && (
        <ResetMfaModal
          target={resettingMfa}
          isSelf={currentUser?.id === resettingMfa.id}
          onClose={() => setResettingMfa(null)}
          onReset={() => {
            // The list carries mfaEnabled, so it has to be refetched for the badge to flip.
            refreshUsers();
            setNotice(`Two-factor authentication reset for ${resettingMfa.fullName}. They must set up a new authenticator app before they can sign in.`);
            setResettingMfa(null);
          }}
        />
      )}

      {deleting && (
        <DeleteUserModal
          target={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            refreshUsers();
            setNotice(`Deleted ${deleting.fullName}.`);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

