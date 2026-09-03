import AdminSidebar from "../components/AdminSidebar";
import ProgramTheme from "../components/ProgramTheme";
import { AuthGuard } from "@/lib/auth/AuthGuard";

/**
 * Admin portal shell — persistent sidebar + main column.
 * Gated behind authentication; unauthenticated users are sent to the login page.
 * Each page renders its own <div className="adm-main"> with topbar + content.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard>
      {/* Per-program colour tokens for every slug, derived from each program's colorHex. */}
      <ProgramTheme />
      {/* Keyboard users can jump past the sidebar on every admin page. */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="adm-shell">
        <AdminSidebar />
        <div id="main-content" style={{ display: "contents" }}>
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
