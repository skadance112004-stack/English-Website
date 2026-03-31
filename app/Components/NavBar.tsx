import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

const NAV_LINKS = [
  { label: "Dashboard",        path: "/dashboard" },
  { label: "Course Create",    path: "/courses/create" },
  { label: "Courses Management", path: "/courses" },
  { label: "Account Settings", path: "/settings" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/");
  };

  // Derive display info from auth context
  const avatarUrl   = user?.photoURL || "";
  const displayName = user?.displayName || "Teacher";
  const initials    = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // Active path matching
  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <style>{`
        .nav-link-item { transition: color 0.15s, background 0.15s; }
        .nav-link-item:hover { color: #111 !important; }
        .nav-menu-item:hover { background: #f3f4f6 !important; }
        .nav-bell:hover { background: #f3f4f6 !important; }
        .nav-profile-btn:hover { background: #f9fafb !important; }
      `}</style>

      <nav style={{
        background: "white",
        borderBottom: "1px solid #e5e7eb",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        position: "sticky",
        top: 0,
        zIndex: 200,
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* ── Logo ── */}
        <Link to="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, background: "#22c55e", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#111", letterSpacing: "-0.2px" }}>
            Enginuity
          </span>
        </Link>

        {/* ── Nav links ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {NAV_LINKS.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className="nav-link-item"
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isActive(link.path) ? 600 : 500,
                textDecoration: "none",
                background: isActive(link.path) ? "#22c55e" : "transparent",
                color: isActive(link.path) ? "white" : "#6b7280",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* ── Right side ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>

          {/* Bell */}
          <button className="nav-bell" style={{
            width: 36, height: 36, borderRadius: 8,
            border: "1px solid #e5e7eb", background: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>

          {/* Profile button */}
          <div style={{ position: "relative" }}>
            <button
              className="nav-profile-btn"
              onClick={() => setMenuOpen(prev => !prev)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 10px 4px 5px",
                border: "1px solid #e5e7eb", borderRadius: 8,
                background: "white", cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                overflow: "hidden", background: "#e5e7eb", flexShrink: 0,
              }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{
                      width: "100%", height: "100%", background: "#22c55e",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontSize: 11, fontWeight: 700,
                    }}>
                      {initials}
                    </div>
                }
              </div>

              <span style={{ fontSize: 13, fontWeight: 600, color: "#111", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayName.split(" ").slice(0, 2).join(" ")}
              </span>

              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
                style={{ transform: menuOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <>
                {/* Backdrop */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 150 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 8px)",
                  background: "white", border: "1px solid #e5e7eb",
                  borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                  width: 190, zIndex: 200, overflow: "hidden",
                }}>
                  {/* User info header */}
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{displayName}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
                  </div>

                  <Link
                    to="/settings"
                    className="nav-menu-item"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", fontSize: 13, color: "#374151", textDecoration: "none", transition: "background 0.15s" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    Account Settings
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="nav-menu-item"
                    style={{
                      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                      padding: "10px 14px", fontSize: 13, color: "#ef4444",
                      background: "none", border: "none", borderTop: "1px solid #f3f4f6",
                      cursor: "pointer", transition: "background 0.15s",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Log Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}