import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

const NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Course create", path: "/courses/create" },
  { label: "Courses", path: "/courses" },
  { label: "Account settings", path: "/settings" },
];

const initialsFor = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    await logout();
    navigate("/");
  };

  const displayName = user?.displayName || "Teacher";
  const avatarUrl = user?.photoURL || "";
  const initials = initialsFor(displayName);
  const isActive = (path: string) => {
    if (path === "/dashboard" || path === "/courses") return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <>
      <style>{`
        .app-navbar { position: sticky; top: 0; z-index: 200; display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 20px; padding: 0 32px; border-bottom: 1px solid #e4e9ef; background: rgba(255, 255, 255, .96); backdrop-filter: blur(12px); font-family: 'DM Sans', sans-serif; }
        .app-navbar a, .app-navbar button { -webkit-tap-highlight-color: transparent; }
        .app-nav-brand { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 9px; color: #172033; font-size: 17px; font-weight: 750; letter-spacing: -.02em; text-decoration: none; }
        .app-nav-logo { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 9px; background: #22a35a; color: white; }
        .app-nav-logo svg { width: 18px; height: 18px; }
        .app-nav-links { display: flex; min-width: 0; align-items: center; justify-content: center; gap: 3px; }
        .app-nav-link { padding: 8px 13px; border-radius: 8px; color: #5c6675; font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; transition: background .15s ease, color .15s ease; }
        .app-nav-link:hover { background: #f3f6f7; color: #1d2939; }
        .app-nav-link[aria-current='page'] { background: #1f9f56; color: #fff; }
        .app-nav-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; }
        .app-nav-icon-button, .app-nav-profile-button, .app-nav-menu-toggle { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border: 1px solid #dfe6ed; background: #fff; color: #475467; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
        .app-nav-icon-button { width: 38px; border-radius: 9px; }
        .app-nav-icon-button:hover, .app-nav-profile-button:hover, .app-nav-menu-toggle:hover { border-color: #bdd8c7; background: #f5fbf7; }
        .app-nav-profile-wrap { position: relative; }
        .app-nav-profile-button { gap: 8px; padding: 4px 9px 4px 5px; border-radius: 9px; }
        .app-nav-avatar { display: grid; width: 28px; height: 28px; place-items: center; overflow: hidden; border-radius: 999px; background: #21a15a; color: #fff; font-size: 11px; font-weight: 750; }
        .app-nav-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .app-nav-profile-name { max-width: 110px; overflow: hidden; color: #344054; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .app-nav-chevron { transition: transform .16s ease; }
        .app-nav-chevron.is-open { transform: rotate(180deg); }
        .app-nav-popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 220; width: 220px; overflow: hidden; border: 1px solid #dfe6ed; border-radius: 12px; background: #fff; box-shadow: 0 16px 30px rgba(16, 24, 40, .13); }
        .app-nav-popover-header { padding: 13px 14px; border-bottom: 1px solid #edf1f5; }
        .app-nav-popover-name { overflow: hidden; color: #172033; font-size: 13px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
        .app-nav-popover-email { margin-top: 3px; overflow: hidden; color: #667085; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .app-nav-popover-link, .app-nav-popover-logout { display: flex; width: 100%; align-items: center; gap: 9px; padding: 11px 14px; border: 0; background: #fff; color: #344054; font: inherit; font-size: 13px; font-weight: 650; text-align: left; text-decoration: none; cursor: pointer; }
        .app-nav-popover-link:hover, .app-nav-popover-logout:hover { background: #f4f7f8; }
        .app-nav-popover-logout { border-top: 1px solid #edf1f5; color: #b42318; }
        .app-nav-popover-logout:hover { background: #fff5f4; }
        .app-nav-menu-toggle { display: none; width: 38px; border-radius: 9px; }
        .app-nav-backdrop { position: fixed; inset: 64px 0 0; z-index: 205; border: 0; background: rgba(15, 23, 42, .22); }
        .app-mobile-panel { position: fixed; top: 64px; right: 12px; left: 12px; z-index: 210; overflow: hidden; border: 1px solid #dfe6ed; border-radius: 14px; background: #fff; box-shadow: 0 18px 35px rgba(16, 24, 40, .16); }
        .app-mobile-profile { display: flex; align-items: center; gap: 10px; padding: 16px; border-bottom: 1px solid #edf1f5; }
        .app-mobile-links { display: grid; gap: 3px; padding: 8px; }
        .app-mobile-link { display: flex; align-items: center; justify-content: space-between; padding: 11px 12px; border-radius: 9px; color: #475467; font-size: 14px; font-weight: 650; text-decoration: none; }
        .app-mobile-link:hover { background: #f4f7f8; color: #1d2939; }
        .app-mobile-link[aria-current='page'] { background: #effcf3; color: #146c3a; }
        .app-mobile-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; border-top: 1px solid #edf1f5; }
        .app-mobile-footer a, .app-mobile-footer button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; border: 1px solid #dfe6ed; border-radius: 9px; background: #fff; color: #344054; font: inherit; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; }
        .app-mobile-footer button { border-color: #f4c7c3; color: #b42318; }
        .app-navbar :focus-visible { outline: 3px solid rgba(34, 163, 90, .28); outline-offset: 2px; }
        @media (max-width: 880px) { .app-navbar { padding: 0 20px; gap: 12px; } .app-nav-link { padding: 8px 9px; font-size: 13px; } .app-nav-profile-name { display: none; } }
        @media (max-width: 700px) { .app-navbar { min-height: 60px; padding: 0 16px; } .app-nav-links, .app-nav-actions { display: none; } .app-nav-menu-toggle { display: inline-flex; } .app-nav-backdrop, .app-mobile-panel { top: 60px; } }
        @media (prefers-reduced-motion: reduce) { .app-navbar *, .app-navbar *::before, .app-navbar *::after { transition-duration: .01ms !important; } }
      `}</style>

      <nav className="app-navbar" aria-label="Primary navigation">
        <Link className="app-nav-brand" to="/dashboard">
          <span className="app-nav-logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg></span>
          Enginuity
        </Link>

        <div className="app-nav-links">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.path);
            return <Link className="app-nav-link" to={link.path} key={link.path} aria-current={active ? "page" : undefined}>{link.label}</Link>;
          })}
        </div>

        <div className="app-nav-actions">
          <Link className="app-nav-icon-button" to="/settings#notifs" aria-label="Open notification preferences" title="Notification preferences">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </Link>

          <div className="app-nav-profile-wrap">
            <button className="app-nav-profile-button" type="button" onClick={() => setProfileMenuOpen((open) => !open)} aria-expanded={profileMenuOpen} aria-controls="account-menu" aria-label="Open account menu">
              <span className="app-nav-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
              <span className="app-nav-profile-name">{displayName}</span>
              <svg className={`app-nav-chevron${profileMenuOpen ? " is-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {profileMenuOpen && <><button className="app-nav-backdrop" type="button" aria-label="Close account menu" onClick={() => setProfileMenuOpen(false)} /><div className="app-nav-popover" id="account-menu"><div className="app-nav-popover-header"><div className="app-nav-popover-name">{displayName}</div><div className="app-nav-popover-email">{user?.email}</div></div><Link className="app-nav-popover-link" to="/settings" onClick={() => setProfileMenuOpen(false)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Account settings</Link><button className="app-nav-popover-logout" type="button" onClick={() => void handleLogout()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Log out</button></div></>}
          </div>
        </div>

        <button className="app-nav-menu-toggle" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}>
          {mobileMenuOpen ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>}
        </button>
      </nav>

      {mobileMenuOpen && <><button className="app-nav-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} /><div className="app-mobile-panel" id="mobile-navigation"><div className="app-mobile-profile"><span className="app-nav-avatar" style={{ width: 36, height: 36 }}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span><div style={{ minWidth: 0 }}><div className="app-nav-popover-name">{displayName}</div><div className="app-nav-popover-email">{user?.email}</div></div></div><div className="app-mobile-links">{NAV_LINKS.map((link) => { const active = isActive(link.path); return <Link className="app-mobile-link" to={link.path} key={link.path} aria-current={active ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>{link.label}<span aria-hidden="true">→</span></Link>; })}</div><div className="app-mobile-footer"><Link to="/settings#notifs" onClick={() => setMobileMenuOpen(false)}>Notifications</Link><button type="button" onClick={() => void handleLogout()}>Log out</button></div></div></>}
    </>
  );
}
