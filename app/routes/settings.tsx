import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router";
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  updateProfile,
} from "firebase/auth";
import { useAuth } from "../auth/AuthContext";
import {
  getTeacherProfile,
  updateTeacherProfile,
  updateTeacherAvatarWithUpload,
} from "../models/teacherModel";
import type { UserProfile } from "../models/teacherModel";



// ─── Toggle Switch ─────────────────────────────────────────────────────────────
const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    style={{
      width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
      background: enabled ? "#22c55e" : "#d1d5db",
      position: "relative", transition: "background 0.2s", flexShrink: 0,
    }}
  >
    <div style={{
      width: 18, height: 18, borderRadius: "50%", background: "white",
      position: "absolute", top: 3, left: enabled ? 23 : 3,
      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
    }} />
  </button>
);

// ─── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "profile",    label: "Profile",           icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { key: "security",   label: "Password & Security",icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  { key: "notifs",     label: "Notifications",     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { key: "billing",    label: "Billing",           icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
  { key: "privacy",    label: "Privacy",           icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
  { key: "help",       label: "Help & Support",    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
];

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function AccountSettings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile]           = useState<UserProfile | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [activeNav, setActiveNav]       = useState("profile");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [bio,       setBio]       = useState("");

  // Password form
  const [currentPw,  setCurrentPw]  = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [pwError,    setPwError]    = useState("");
  const [pwSuccess,  setPwSuccess]  = useState("");

  // Notifications
  const [notifs, setNotifs] = useState({
    courseUpdates:   true,
    studentActivity: true,
    directMessages:  false,
    marketingEmails: false,
  });

  // Feedback toasts
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { if (user) fetchProfile(user.uid); }, [user]);

  const fetchProfile = async (uid: string) => {
    try {
      const data = await getTeacherProfile(uid);
      if (data) {
        setProfile(data);
        const parts = data.name?.split(" ") || [];
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setEmail(data.email || "");
        setPhone((data as any).phone || "");
        setBio(data.teacherProfile?.bio || "");
        if ((data as any).notificationPreferences) setNotifs((data as any).notificationPreferences);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;
    setSaving(true);
    setProfileMsg(null);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      await updateTeacherProfile(user.uid, {
        name: fullName,
        phone,
        teacherProfile: { ...profile.teacherProfile, bio },
        notificationPreferences: notifs,
      } as any);

      // Sync with Firebase Auth
      await updateProfile(user, { displayName: fullName });

      setProfile({ ...profile, name: fullName });
      setProfileMsg({ type: "success", text: "Profile updated successfully!" });
    } catch {
      setProfileMsg({ type: "error", text: "Failed to update profile." });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!user) return;
    if (newPw !== confirmPw) { setPwError("Passwords do not match."); return; }
    setPwError(""); setPwSuccess(""); setSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email!, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setPwSuccess("Password updated successfully!");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      setPwError(err.message || "Failed to update password.");
    } finally { setSaving(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSaving(true);
    try {
      const url = await updateTeacherAvatarWithUpload(user.uid, file);
      
      // Sync with Firebase Auth
      await updateProfile(user, { photoURL: url });

      setProfile(prev => prev ? { ...prev, avatar: url } : null);
    } catch { alert("Failed to upload avatar."); }
    finally { setSaving(false); }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !profile) return;
    await updateTeacherProfile(user.uid, { avatar: "" } as any);
    
    // Sync with Firebase Auth
    await updateProfile(user, { photoURL: "" });

    setProfile({ ...profile, avatar: "" });
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure? This action is irreversible.")) return;
    try { await deleteUser(user); navigate("/"); }
    catch (err: any) { alert(err.message); }
  };

  const handleLogout = async () => { await logout(); navigate("/"); };

  const avatarUrl   = profile?.avatar || user?.photoURL || "";
  const displayName = profile?.name   || user?.displayName || "Teacher";

  // ── Shared input style ──────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1px solid #e5e7eb",
    borderRadius: 8, fontSize: 14, color: "#111", background: "white",
    fontFamily: "'DM Sans', sans-serif", outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 6,
  };
  const card: React.CSSProperties = {
    background: "white", borderRadius: 12, border: "1px solid #e5e7eb",
    padding: "28px 32px", marginBottom: 20, scrollMarginTop: 40,
  };
  const cardTitle: React.CSSProperties = {
    fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 4,
  };
  const cardSub: React.CSSProperties = {
    fontSize: 13, color: "#9ca3af", marginBottom: 24,
  };
  const divider: React.CSSProperties = {
    borderTop: "1px solid #f3f4f6", paddingTop: 20, marginTop: 8,
    display: "flex", justifyContent: "flex-end", gap: 10,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #f8fafc; }
        input, select, textarea, button { font-family: 'DM Sans', sans-serif; }
        .inp:focus { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.10) !important; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; color: #6b7280; transition: background 0.15s, color 0.15s; border: none; background: none; width: 100%; }
        .nav-item:hover { background: #f3f4f6; color: #374151; }
        .nav-item.active { background: #f0fdf4; color: #16a34a; font-weight: 600; }
        .btn-outline { padding: 9px 18px; border: 1px solid #e5e7eb; borderRadius: 8px; background: white; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; border-radius: 8px; }
        .btn-outline:hover { background: #f9fafb; }
        .btn-green { padding: 9px 18px; background: #22c55e; border: none; borderRadius: 8px; font-size: 13px; font-weight: 600; color: white; cursor: pointer; border-radius: 8px; }
        .btn-green:hover { background: #16a34a; }
        .btn-green:disabled { opacity: 0.6; cursor: not-allowed; }
        .notif-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #f3f4f6; }
        .notif-row:last-child { border-bottom: none; padding-bottom: 0; }
        .notif-row:first-child { padding-top: 0; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', sans-serif" }}>

      

        {/* ── Body ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px", display: "flex", gap: 32, alignItems: "flex-start" }}>

          {/* ── Sidebar ── */}
          <aside style={{ width: 220, flexShrink: 0, position: "sticky", top: 40 }}>
            {/* User card */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, padding: "0 4px" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid #e5e7eb" }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 18, fontWeight: 700 }}>{displayName[0]}</div>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Teacher</div>
              </div>
            </div>

            {/* Nav */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {NAV_ITEMS.map(item => (
                <button
                  key={item.key}
                  className={`nav-item${activeNav === item.key ? " active" : ""}`}
                  onClick={() => {
                    setActiveNav(item.key);
                    document.getElementById(item.key)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {/* Help box */}
            <div style={{ marginTop: 32, background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 12, padding: "18px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 6 }}>Need Help?</div>
              <div style={{ fontSize: 12, color: "#15803d", lineHeight: 1.6, marginBottom: 14 }}>Check our teacher resources or contact support.</div>
              <button style={{ width: "100%", background: "white", color: "#16a34a", border: "1px solid #bbf7d0", padding: "7px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                View Resources
              </button>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>Account Settings</h1>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28 }}>Manage your teacher profile and preferences.</p>

            {/* ── Profile Photo ── */}
            <div style={card} id="profile">
              <div style={cardTitle}>Profile Photo</div>
              <div style={cardSub}>Update your profile picture displayed across the platform.</div>

              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                {/* Avatar */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 86, height: 86, borderRadius: "50%", overflow: "hidden", border: "3px solid #e5e7eb" }}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 28, fontWeight: 700 }}>{displayName[0]}</div>}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ position: "absolute", bottom: 2, right: 2, width: 26, height: 26, background: "#22c55e", borderRadius: "50%", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
                </div>

                <div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <button className="btn-outline" onClick={() => fileInputRef.current?.click()}>Change Photo</button>
                    <button
                      onClick={handleRemoveAvatar}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#ef4444" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Remove
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: "#9ca3af" }}>Recommended: Square JPG, PNG, or GIF, at least 1000×1000 pixels.</p>
                </div>
              </div>
            </div>

            {/* ── Personal Information ── */}
            <div style={card}>
              <div style={cardTitle}>Personal Information</div>
              <div style={cardSub}>Update your personal details and contact information.</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div>
                  <label style={lbl}>First Name</label>
                  <input className="inp" style={inp} type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <label style={lbl}>Last Name</label>
                  <input className="inp" style={inp} type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div>
                  <label style={lbl}>Email Address</label>
                  <input className="inp" style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
                </div>
                <div>
                  <label style={lbl}>Phone Number</label>
                  <input className="inp" style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={lbl}>Bio</label>
                <textarea className="inp" style={{ ...inp, height: 96, resize: "none", lineHeight: 1.6 }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us a little about yourself..." />
              </div>

              {profileMsg && (
                <div style={{ fontSize: 13, color: profileMsg.type === "success" ? "#16a34a" : "#ef4444", marginBottom: 12 }}>
                  {profileMsg.text}
                </div>
              )}

              <div style={divider}>
                <button className="btn-outline" onClick={() => user && fetchProfile(user.uid)}>Cancel</button>
                <button className="btn-green" onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
              </div>
            </div>

            {/* ── Password ── */}
            <div style={card} id="security">
              <div style={cardTitle}>Password</div>
              <div style={cardSub}>Ensure your account is secure by using a strong password.</div>

              <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 16, marginBottom: 8 }}>
                {[
                  { label: "Current Password", value: currentPw, set: setCurrentPw, complete: "current-password" },
                  { label: "New Password",      value: newPw,     set: setNewPw,     complete: "new-password" },
                  { label: "Confirm New Password", value: confirmPw, set: setConfirmPw, complete: "new-password" },
                ].map(f => (
                  <div key={f.label}>
                    <label style={lbl}>{f.label}</label>
                    <input className="inp" style={inp} type="password" autoComplete={f.complete} value={f.value} onChange={e => f.set(e.target.value)} placeholder="••••••••" />
                  </div>
                ))}
                {pwError   && <p style={{ fontSize: 13, color: "#ef4444" }}>{pwError}</p>}
                {pwSuccess && <p style={{ fontSize: 13, color: "#16a34a" }}>{pwSuccess}</p>}
              </div>

              <div style={divider}>
                <button className="btn-outline" onClick={() => { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(""); setPwSuccess(""); }}>Cancel</button>
                <button className="btn-green" onClick={handleUpdatePassword} disabled={saving}>{saving ? "Updating…" : "Update Password"}</button>
              </div>
            </div>

            {/* ── Notification Preferences ── */}
            <div style={card} id="notifs">
              <div style={cardTitle}>Notification Preferences</div>
              <div style={cardSub}>Choose what updates you want to receive.</div>

              <div>
                {[
                  { key: "courseUpdates",   label: "Course Updates",   desc: "Receive notifications when new course materials are added." },
                  { key: "studentActivity", label: "Student Activity", desc: "Get notified about student submissions and questions." },
                  { key: "directMessages",  label: "Direct Messages",  desc: "Receive emails when you get a new direct message." },
                  { key: "marketingEmails", label: "Marketing Emails", desc: "Receive news, updates, and special offers from Enginuity." },
                ].map(item => (
                  <div key={item.key} className="notif-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{item.desc}</div>
                    </div>
                    <ToggleSwitch
                      enabled={(notifs as any)[item.key]}
                      onChange={() => setNotifs({ ...notifs, [item.key]: !(notifs as any)[item.key] })}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Danger Zone ── */}
            <div style={{ ...card, background: "#fff5f5", border: "1px solid #fecaca", scrollMarginTop: 40 }} id="privacy">
              <div style={{ ...cardTitle, color: "#b91c1c" }}>Danger Zone</div>
              <div style={{ ...cardSub, color: "#ef4444", marginBottom: 20 }}>Irreversible actions for your account.</div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#b91c1c", marginBottom: 3 }}>Delete Account</div>
                  <div style={{ fontSize: 12, color: "#ef4444" }}>Once you delete your account, there is no going back. Please be certain.</div>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#ef4444" }}
                >
                  Delete Account
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
