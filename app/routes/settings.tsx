import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { useAuth } from "../auth/AuthContext";
import {
  getTeacherProfile,
  updateTeacherAvatarWithUpload,
  updateTeacherProfile,
} from "../models/teacherModel";
import { deleteTeacherAvatar } from "../models/storageModel";
import type { UserProfile } from "../models/teacherModel";

type Notice = { type: "success" | "error"; text: string } | null;

type NotificationPreferences = {
  courseUpdates: boolean;
  studentActivity: boolean;
  directMessages: boolean;
  marketingEmails: boolean;
};

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  courseUpdates: true,
  studentActivity: true,
  directMessages: false,
  marketingEmails: false,
};

const SECTION_ITEMS = [
  { key: "profile", label: "Profile", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  { key: "security", label: "Password & security", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  { key: "notifs", label: "Notifications", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  { key: "privacy", label: "Privacy", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
];

const NOTIFICATION_ITEMS: Array<{ key: keyof NotificationPreferences; label: string; description: string }> = [
  { key: "courseUpdates", label: "Course updates", description: "Receive notifications when new course materials are added." },
  { key: "studentActivity", label: "Student activity", description: "Get notified about student submissions and questions." },
  { key: "directMessages", label: "Direct messages", description: "Receive an email when you get a new direct message." },
  { key: "marketingEmails", label: "Product news", description: "Receive product news, updates, and special offers from Enginuity." },
];

const initialsFor = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const friendlyPasswordError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Your current password is incorrect.";
  if (code === "auth/weak-password") return "Choose a stronger password of at least 8 characters.";
  if (code === "auth/requires-recent-login") return "For your security, please sign in again and retry.";
  return "We couldn't update your password. Please try again.";
};

function ToggleSwitch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button
      className="settings-toggle"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span aria-hidden="true" />
    </button>
  );
}

function SettingsSkeleton() {
  return (
    <div className="settings-loading" aria-label="Loading account settings" aria-busy="true">
      <span className="settings-skeleton" style={{ width: 220, height: 30 }} />
      <span className="settings-skeleton" style={{ width: 320, maxWidth: "75%", height: 16 }} />
      {[0, 1, 2].map((item) => <div className="settings-skeleton-card" key={item}><span className="settings-skeleton" style={{ width: 160, height: 18 }} /><span className="settings-skeleton" style={{ width: "48%", height: 14 }} /><span className="settings-skeleton" style={{ width: "100%", height: 120 }} /></div>)}
    </div>
  );
}

export default function AccountSettings() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeSection, setActiveSection] = useState("profile");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [notifications, setNotifications] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [avatarNotice, setAvatarNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [notificationsNotice, setNotificationsNotice] = useState<Notice>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const fetchProfile = useCallback(async (uid: string) => {
    setLoading(true);
    setLoadError("");

    try {
      const data = await getTeacherProfile(uid);
      if (!data) {
        setLoadError("We couldn't find this profile. Please refresh the page or contact support.");
        return;
      }

      setProfile(data);
      const nameParts = data.name?.trim().split(/\s+/).filter(Boolean) || [];
      setFirstName(nameParts[0] || "");
      setLastName(nameParts.slice(1).join(" "));
      setEmail(data.email || user?.email || "");
      setPhone(data.phone || "");
      setBio(data.teacherProfile?.bio || "");
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...data.notificationPreferences });
    } catch {
      setLoadError("We couldn't load your account settings. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (user) void fetchProfile(user.uid);
  }, [fetchProfile, user]);

  useEffect(() => {
    const target = location.hash.replace("#", "");
    if (!target) return;
    const timeout = window.setTimeout(() => {
      const section = document.getElementById(target);
      if (section) {
        setActiveSection(target);
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [location.hash, loading]);

  useEffect(() => {
    if (loading) return;
    const sections = SECTION_ITEMS
      .map((item) => document.getElementById(item.key))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
      if (visibleSection) setActiveSection(visibleSection.target.id);
    }, { rootMargin: "-18% 0px -64% 0px", threshold: [0.01, 0.25, 0.5] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [loading]);

  const handleSectionNavigation = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;
    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName) {
      setProfileNotice({ type: "error", text: "Enter at least a first name before saving." });
      return;
    }

    setProfileSaving(true);
    setProfileNotice(null);
    try {
      const updatedTeacherProfile: NonNullable<UserProfile["teacherProfile"]> = {
        bio: bio.trim(),
        experience: profile.teacherProfile?.experience ?? "",
        expertise: profile.teacherProfile?.expertise ?? [],
        totalCourses: profile.teacherProfile?.totalCourses ?? 0,
        totalStudents: profile.teacherProfile?.totalStudents ?? 0,
        averageRating: profile.teacherProfile?.averageRating ?? 0,
      };
      await updateTeacherProfile(user.uid, {
        name: fullName,
        phone: phone.trim(),
        teacherProfile: updatedTeacherProfile,
      });
      await updateProfile(user, { displayName: fullName });
      setProfile((current) => current ? { ...current, name: fullName, phone: phone.trim(), teacherProfile: updatedTeacherProfile } : current);
      setProfileNotice({ type: "success", text: "Profile saved." });
    } catch {
      setProfileNotice({ type: "error", text: "We couldn't save your profile. Please try again." });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!user || !profile) return;
    setNotificationsSaving(true);
    setNotificationsNotice(null);
    try {
      await updateTeacherProfile(user.uid, { notificationPreferences: notifications });
      setProfile((current) => current ? { ...current, notificationPreferences: notifications } : current);
      setNotificationsNotice({ type: "success", text: "Notification preferences saved." });
    } catch {
      setNotificationsNotice({ type: "error", text: "We couldn't save your notification preferences." });
    } finally {
      setNotificationsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (!new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]).has(file.type)) {
      setAvatarNotice({ type: "error", text: "Choose a JPG, PNG, GIF, or other image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarNotice({ type: "error", text: "Choose an image smaller than 5 MB." });
      return;
    }

    setAvatarSaving(true);
    setAvatarNotice(null);
    try {
      const previousAvatar = profile?.avatar || user.photoURL || "";
      const url = await updateTeacherAvatarWithUpload(user.uid, file, previousAvatar);
      await updateProfile(user, { photoURL: url });
      setProfile((current) => current ? { ...current, avatar: url } : current);
      setAvatarNotice({ type: "success", text: "Profile photo updated." });
    } catch {
      setAvatarNotice({ type: "error", text: "We couldn't upload that photo. Please try again." });
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar) return;
    setAvatarSaving(true);
    setAvatarNotice(null);
    try {
      await deleteTeacherAvatar(profile.avatar);
      await updateTeacherProfile(user.uid, { avatar: "" });
      await updateProfile(user, { photoURL: "" });
      setProfile((current) => current ? { ...current, avatar: "" } : current);
      setAvatarNotice({ type: "success", text: "Profile photo removed." });
    } catch {
      setAvatarNotice({ type: "error", text: "We couldn't remove your photo. Please try again." });
    } finally {
      setAvatarSaving(false);
    }
  };

  const hasPasswordProvider = user?.providerData.some((provider) => provider.providerId === "password") ?? false;

  const handleUpdatePassword = async () => {
    if (!user || !hasPasswordProvider) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordNotice({ type: "error", text: "Complete all password fields to continue." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNotice({ type: "error", text: "Your new password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: "error", text: "Your new passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    setPasswordNotice(null);
    try {
      const credential = EmailAuthProvider.credential(user.email || email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({ type: "success", text: "Password updated." });
    } catch (error) {
      setPasswordNotice({ type: "error", text: friendlyPasswordError(error) });
    } finally {
      setPasswordSaving(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteConfirmation("");
    setDeleteError("");
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmation !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const deleteTeacherAccount = httpsCallable(getFunctions(), "deleteTeacherAccount");
      await deleteTeacherAccount();
      await logout();
      navigate("/");
    } catch (error: unknown) {
      const message = typeof error === "object" && error && "message" in error ? String(error.message) : "We couldn't delete your account. Please try again.";
      setDeleteError(message);
      setDeleting(false);
    }
  };

  const resetProfileForm = () => {
    if (!profile) return;
    const nameParts = profile.name?.trim().split(/\s+/).filter(Boolean) || [];
    setFirstName(nameParts[0] || "");
    setLastName(nameParts.slice(1).join(" "));
    setPhone(profile.phone || "");
    setBio(profile.teacherProfile?.bio || "");
    setProfileNotice(null);
  };

  const avatarUrl = profile?.avatar || user?.photoURL || "";
  const displayName = profile?.name || user?.displayName || "Teacher";

  return (
    <>
      <style>{`
        .settings-page { min-height: calc(100vh - 64px); background: #f6f8fb; color: #172033; font-family: 'DM Sans', sans-serif; }
        .settings-shell { display: grid; width: min(100%, 1180px); grid-template-columns: 228px minmax(0, 1fr); gap: 36px; margin: 0 auto; padding: 36px 32px 56px; }
        .settings-sidebar { position: sticky; top: 88px; align-self: start; }
        .settings-person { display: flex; align-items: center; gap: 12px; margin: 0 4px 24px; }
        .settings-avatar { display: grid; width: 48px; height: 48px; place-items: center; overflow: hidden; flex: 0 0 48px; border: 2px solid #d9fbe5; border-radius: 999px; background: #1f9f56; color: #fff; font-size: 17px; font-weight: 750; }
        .settings-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .settings-person-name { overflow: hidden; color: #172033; font-size: 14px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
        .settings-person-role { margin-top: 3px; color: #167442; font-size: 12px; font-weight: 700; }
        .settings-nav { display: grid; gap: 3px; }
        .settings-nav-button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 10px 12px; border: 0; border-radius: 9px; background: transparent; color: #586577; font: inherit; font-size: 14px; font-weight: 650; text-align: left; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .settings-nav-button svg { width: 17px; height: 17px; }
        .settings-nav-button:hover { background: #eef3f1; color: #344054; }
        .settings-nav-button[aria-current='true'] { background: #eafaf0; color: #15713d; }
        .settings-help { margin-top: 30px; padding: 17px; border: 1px solid #d1f3dd; border-radius: 13px; background: #effcf4; }
        .settings-help h2 { margin: 0 0 6px; color: #166534; font-size: 14px; }
        .settings-help p { margin: 0 0 14px; color: #287348; font-size: 12px; line-height: 1.5; }
        .settings-help a { display: block; padding: 9px; border: 1px solid #b9ebc9; border-radius: 8px; background: #fff; color: #166534; font-size: 12px; font-weight: 750; text-align: center; text-decoration: none; }
        .settings-main { min-width: 0; }
        .settings-heading { margin-bottom: 28px; }
        .settings-heading h1 { margin: 0; color: #172033; font-size: 26px; line-height: 1.2; letter-spacing: -.025em; }
        .settings-heading p { margin: 7px 0 0; color: #667085; font-size: 14px; }
        .settings-card { margin-bottom: 20px; padding: 27px 30px; scroll-margin-top: 88px; border: 1px solid #e3e9ef; border-radius: 15px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
        .settings-card h2 { margin: 0; color: #172033; font-size: 17px; letter-spacing: -.012em; }
        .settings-card-description { margin: 5px 0 24px; color: #667085; font-size: 13px; line-height: 1.5; }
        .settings-photo-row { display: flex; align-items: center; gap: 20px; }
        .settings-photo { position: relative; display: grid; width: 88px; height: 88px; place-items: center; overflow: hidden; flex: 0 0 88px; border: 3px solid #e2e8f0; border-radius: 999px; background: #1f9f56; color: #fff; font-size: 27px; font-weight: 750; }
        .settings-photo img { width: 100%; height: 100%; object-fit: cover; }
        .settings-photo-button { position: absolute; right: 0; bottom: 0; display: grid; width: 29px; height: 29px; place-items: center; border: 2px solid #fff; border-radius: 999px; background: #15803d; color: #fff; cursor: pointer; }
        .settings-photo-button svg { width: 14px; height: 14px; }
        .settings-photo-actions { min-width: 0; }
        .settings-action-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .settings-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 7px; padding: 9px 14px; border: 1px solid transparent; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 750; cursor: pointer; transition: background .15s ease, border-color .15s ease, color .15s ease; }
        .settings-button:disabled, .settings-toggle:disabled { opacity: .58; cursor: not-allowed; }
        .settings-button-primary { border-color: #15803d; background: #15803d; color: #fff; }
        .settings-button-primary:hover:not(:disabled) { border-color: #166534; background: #166534; }
        .settings-button-secondary { border-color: #d7e0e9; background: #fff; color: #344054; }
        .settings-button-secondary:hover:not(:disabled) { border-color: #b7c5d2; background: #f8fafc; }
        .settings-button-danger { border-color: transparent; background: transparent; color: #b42318; }
        .settings-button-danger:hover:not(:disabled) { background: #fff1f0; }
        .settings-photo-hint { margin: 10px 0 0; color: #667085; font-size: 12px; line-height: 1.5; }
        .settings-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 20px; margin-bottom: 18px; }
        .settings-field { min-width: 0; }
        .settings-label { display: block; margin-bottom: 7px; color: #475467; font-size: 13px; font-weight: 700; }
        .settings-input, .settings-textarea { box-sizing: border-box; width: 100%; border: 1px solid #d7e0e9; border-radius: 9px; background: #fff; color: #172033; font: inherit; font-size: 14px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
        .settings-input { min-height: 42px; padding: 10px 12px; }
        .settings-textarea { min-height: 108px; padding: 11px 12px; resize: vertical; line-height: 1.5; }
        .settings-input:focus, .settings-textarea:focus { border-color: #23995a; box-shadow: 0 0 0 3px rgba(34, 163, 90, .15); }
        .settings-input[readonly] { border-color: #e4e9ef; background: #f4f6f8; color: #667085; cursor: default; }
        .settings-field-helper { display: flex; justify-content: flex-end; margin-top: 5px; color: #667085; font-size: 11px; }
        .settings-card-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin: 24px -30px -27px; padding: 18px 30px; border-top: 1px solid #edf1f5; background: #fbfcfd; border-radius: 0 0 15px 15px; }
        .settings-notice { display: flex; align-items: flex-start; gap: 8px; margin: 17px 0 0; padding: 10px 12px; border: 1px solid; border-radius: 9px; font-size: 13px; line-height: 1.4; }
        .settings-notice.success { border-color: #b7e7c8; background: #f0fcf4; color: #17683a; }
        .settings-notice.error { border-color: #fecaca; background: #fff6f5; color: #a12a22; }
        .settings-password-wrap { width: min(100%, 430px); display: grid; gap: 16px; }
        .settings-provider-note { padding: 13px 14px; border: 1px solid #d9e4ee; border-radius: 10px; background: #f8fafc; color: #475467; font-size: 13px; line-height: 1.5; }
        .settings-notification-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; padding: 17px 0; border-bottom: 1px solid #edf1f5; }
        .settings-notification-row:first-of-type { padding-top: 0; }
        .settings-notification-row:last-of-type { padding-bottom: 0; border-bottom: 0; }
        .settings-notification-row h3 { margin: 0 0 4px; color: #344054; font-size: 14px; }
        .settings-notification-row p { margin: 0; color: #667085; font-size: 12px; line-height: 1.45; }
        .settings-toggle { position: relative; width: 46px; height: 26px; border: 0; border-radius: 999px; background: #c8d2dd; cursor: pointer; transition: background .16s ease; }
        .settings-toggle[aria-checked='true'] { background: #1f9f56; }
        .settings-toggle span { position: absolute; top: 4px; left: 4px; width: 18px; height: 18px; border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(16, 24, 40, .2); transition: transform .16s ease; }
        .settings-toggle[aria-checked='true'] span { transform: translateX(20px); }
        .settings-danger-card { border-color: #fecaca; background: #fff8f7; }
        .settings-danger-card h2 { color: #a12a22; }
        .settings-danger-card .settings-card-description { color: #b5473c; }
        .settings-danger-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
        .settings-danger-row h3 { margin: 0 0 4px; color: #8f211d; font-size: 14px; }
        .settings-danger-row p { margin: 0; color: #b5473c; font-size: 12px; line-height: 1.5; }
        .settings-page :focus-visible { outline: 3px solid rgba(34, 163, 90, .3); outline-offset: 2px; }
        .settings-loading { display: grid; gap: 16px; max-width: 830px; padding: 36px 32px; margin: 0 auto; }
        .settings-skeleton-card { display: grid; gap: 14px; min-height: 190px; padding: 28px; border: 1px solid #e3e9ef; border-radius: 15px; background: #fff; }
        .settings-skeleton { display: block; border-radius: 7px; background: linear-gradient(90deg, #eef2f6 25%, #f8fafc 50%, #eef2f6 75%); background-size: 200% 100%; animation: settings-shimmer 1.3s infinite; }
        .settings-load-error { width: min(100% - 32px, 650px); margin: 56px auto; padding: 24px; border: 1px solid #fecaca; border-radius: 14px; background: #fff7f7; color: #8f211d; text-align: center; }
        .settings-load-error h1 { margin: 0 0 8px; font-size: 20px; }
        .settings-load-error p { margin: 0 0 18px; color: #a12a22; font-size: 14px; line-height: 1.5; }
        .settings-dialog-backdrop { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .45); }
        .settings-dialog { width: min(100%, 450px); padding: 24px; border: 1px solid #dfe6ed; border-radius: 16px; background: #fff; box-shadow: 0 24px 48px rgba(15, 23, 42, .23); }
        .settings-dialog h2 { margin: 0; color: #8f211d; font-size: 20px; }
        .settings-dialog p { margin: 10px 0 18px; color: #475467; font-size: 14px; line-height: 1.55; }
        .settings-dialog-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 20px; }
        @keyframes settings-shimmer { to { background-position: -200% 0; } }
        @media (max-width: 940px) { .settings-shell { grid-template-columns: 1fr; gap: 24px; padding: 28px 24px 44px; } .settings-sidebar { position: static; } .settings-person { display: none; } .settings-nav { display: flex; overflow-x: auto; padding-bottom: 3px; } .settings-nav-button { width: auto; flex: 0 0 auto; white-space: nowrap; } .settings-help { display: none; } }
        @media (max-width: 620px) { .settings-page { min-height: calc(100vh - 60px); } .settings-shell { padding: 22px 16px 36px; } .settings-heading { margin-bottom: 22px; } .settings-heading h1 { font-size: 24px; } .settings-card { padding: 21px 18px; border-radius: 13px; scroll-margin-top: 76px; } .settings-card-footer { margin: 22px -18px -21px; padding: 15px 18px; border-radius: 0 0 13px 13px; } .settings-field-grid { grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; } .settings-photo-row { align-items: flex-start; flex-direction: column; } .settings-photo-actions { width: 100%; } .settings-danger-row { align-items: flex-start; flex-direction: column; } .settings-danger-row .settings-button { width: 100%; } }
        @media (max-width: 410px) { .settings-card-footer, .settings-dialog-actions { align-items: stretch; flex-direction: column-reverse; } .settings-card-footer .settings-button, .settings-dialog-actions .settings-button { width: 100%; } }
        @media (prefers-reduced-motion: reduce) { .settings-page *, .settings-page *::before, .settings-page *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
      `}</style>

      <main className="settings-page">
        {loading ? <SettingsSkeleton /> : loadError ? <section className="settings-load-error" role="alert"><h1>Account settings couldn't load</h1><p>{loadError}</p>{user && <button className="settings-button settings-button-primary" type="button" onClick={() => void fetchProfile(user.uid)}>Try again</button>}</section> : <div className="settings-shell">
          <aside className="settings-sidebar" aria-label="Account settings sections">
            <div className="settings-person">
              <span className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initialsFor(displayName)}</span>
              <div style={{ minWidth: 0 }}><div className="settings-person-name">{displayName}</div><div className="settings-person-role">Teacher</div></div>
            </div>
            <nav className="settings-nav" aria-label="Settings sections">
              {SECTION_ITEMS.map((item) => <button className="settings-nav-button" type="button" key={item.key} aria-current={activeSection === item.key ? "true" : undefined} onClick={() => handleSectionNavigation(item.key)}>{item.icon}{item.label}</button>)}
            </nav>
            <section className="settings-help"><h2>Need help?</h2><p>Our teacher support team can help you get unstuck.</p><a href="mailto:support@enginuity.app?subject=Enginuity%20teacher%20support">Contact support</a></section>
          </aside>

          <div className="settings-main">
            <header className="settings-heading"><h1>Account settings</h1><p>Manage your teacher profile, security, and preferences.</p></header>

            <section className="settings-card" id="profile" aria-labelledby="profile-photo-heading">
              <h2 id="profile-photo-heading">Profile photo</h2>
              <p className="settings-card-description">This photo appears on your teaching workspace and course activity.</p>
              <div className="settings-photo-row">
                <div className="settings-photo">{avatarUrl ? <img src={avatarUrl} alt="Your profile" /> : initialsFor(displayName)}<button className="settings-photo-button" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Choose a new profile photo" disabled={avatarSaving}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button></div>
                <div className="settings-photo-actions"><div className="settings-action-row"><button className="settings-button settings-button-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={avatarSaving}>{avatarSaving ? "Uploading…" : "Change photo"}</button><button className="settings-button settings-button-danger" type="button" onClick={() => void handleRemoveAvatar()} disabled={!profile?.avatar || avatarSaving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Remove</button></div><p className="settings-photo-hint">JPG, PNG, or GIF up to 5 MB. Square images work best.</p>{avatarNotice && <div className={`settings-notice ${avatarNotice.type}`} role={avatarNotice.type === "error" ? "alert" : "status"}>{avatarNotice.text}</div>}</div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: "none" }} onChange={(event) => void handleAvatarChange(event)} />
            </section>

            <section className="settings-card" aria-labelledby="personal-information-heading">
              <h2 id="personal-information-heading">Personal information</h2>
              <p className="settings-card-description">Update your personal details and contact information.</p>
              <div className="settings-field-grid">
                <div className="settings-field"><label className="settings-label" htmlFor="first-name">First name</label><input className="settings-input" id="first-name" type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" /></div>
                <div className="settings-field"><label className="settings-label" htmlFor="last-name">Last name</label><input className="settings-input" id="last-name" type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" /></div>
                <div className="settings-field"><label className="settings-label" htmlFor="email">Email address</label><input className="settings-input" id="email" type="email" value={email} readOnly aria-describedby="email-helper" /><span className="settings-field-helper" id="email-helper">Email changes are managed through your sign-in provider.</span></div>
                <div className="settings-field"><label className="settings-label" htmlFor="phone">Phone number</label><input className="settings-input" id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+1 (555) 000-0000" /></div>
              </div>
              <div className="settings-field"><label className="settings-label" htmlFor="bio">Bio</label><textarea className="settings-textarea" id="bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} placeholder="Tell learners a little about yourself…" /><span className="settings-field-helper">{bio.length}/500</span></div>
              {profileNotice && <div className={`settings-notice ${profileNotice.type}`} role={profileNotice.type === "error" ? "alert" : "status"}>{profileNotice.text}</div>}
              <div className="settings-card-footer"><button className="settings-button settings-button-secondary" type="button" onClick={resetProfileForm} disabled={profileSaving}>Cancel</button><button className="settings-button settings-button-primary" type="button" onClick={() => void handleSaveProfile()} disabled={profileSaving}>{profileSaving ? "Saving…" : "Save changes"}</button></div>
            </section>

            <section className="settings-card" id="security" aria-labelledby="password-heading">
              <h2 id="password-heading">Password</h2>
              <p className="settings-card-description">Use a strong, unique password to keep your account safe.</p>
              {hasPasswordProvider ? <><div className="settings-password-wrap"><div className="settings-field"><label className="settings-label" htmlFor="current-password">Current password</label><input className="settings-input" id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div><div className="settings-field"><label className="settings-label" htmlFor="new-password">New password</label><input className="settings-input" id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><span className="settings-field-helper">At least 8 characters</span></div><div className="settings-field"><label className="settings-label" htmlFor="confirm-password">Confirm new password</label><input className="settings-input" id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></div>{passwordNotice && <div className={`settings-notice ${passwordNotice.type}`} role={passwordNotice.type === "error" ? "alert" : "status"}>{passwordNotice.text}</div>}<div className="settings-card-footer"><button className="settings-button settings-button-secondary" type="button" onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordNotice(null); }} disabled={passwordSaving}>Cancel</button><button className="settings-button settings-button-primary" type="button" onClick={() => void handleUpdatePassword()} disabled={passwordSaving}>{passwordSaving ? "Updating…" : "Update password"}</button></div></> : <div className="settings-provider-note">Your account is signed in through an external provider. Manage your password directly with that provider.</div>}
            </section>

            <section className="settings-card" id="notifs" aria-labelledby="notifications-heading">
              <h2 id="notifications-heading">Notification preferences</h2>
              <p className="settings-card-description">Choose which updates you want to receive.</p>
              <div>{NOTIFICATION_ITEMS.map((item) => <div className="settings-notification-row" key={item.key}><div><h3>{item.label}</h3><p>{item.description}</p></div><ToggleSwitch checked={notifications[item.key]} disabled={notificationsSaving} label={`${item.label}: ${notifications[item.key] ? "on" : "off"}`} onChange={() => { setNotifications((current) => ({ ...current, [item.key]: !current[item.key] })); setNotificationsNotice(null); }} /></div>)}</div>
              {notificationsNotice && <div className={`settings-notice ${notificationsNotice.type}`} role={notificationsNotice.type === "error" ? "alert" : "status"}>{notificationsNotice.text}</div>}
              <div className="settings-card-footer"><button className="settings-button settings-button-secondary" type="button" onClick={() => { setNotifications({ ...DEFAULT_NOTIFICATIONS, ...profile?.notificationPreferences }); setNotificationsNotice(null); }} disabled={notificationsSaving}>Cancel</button><button className="settings-button settings-button-primary" type="button" onClick={() => void handleSaveNotifications()} disabled={notificationsSaving}>{notificationsSaving ? "Saving…" : "Save preferences"}</button></div>
            </section>

            <section className="settings-card settings-danger-card" id="privacy" aria-labelledby="danger-zone-heading">
              <h2 id="danger-zone-heading">Danger zone</h2>
              <p className="settings-card-description">Irreversible actions for your account.</p>
              <div className="settings-danger-row"><div><h3>Delete account</h3><p>This permanently removes your profile, courses, and associated data.</p></div><button className="settings-button settings-button-danger" type="button" onClick={() => setDeleteModalOpen(true)}>Delete account</button></div>
            </section>
          </div>
        </div>}
      </main>

      {deleteModalOpen && <div className="settings-dialog-backdrop" role="presentation" onMouseDown={closeDeleteModal}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="delete-account-title">Delete your account?</h2><p>This cannot be undone. Your courses, profile, and account data will be permanently removed. Type <strong>DELETE</strong> to continue.</p><label className="settings-label" htmlFor="delete-confirmation">Confirmation</label><input className="settings-input" id="delete-confirmation" autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="Type DELETE" disabled={deleting} />{deleteError && <div className="settings-notice error" role="alert">{deleteError}</div>}<div className="settings-dialog-actions"><button className="settings-button settings-button-secondary" type="button" onClick={closeDeleteModal} disabled={deleting}>Cancel</button><button className="settings-button settings-button-danger" type="button" onClick={() => void handleDeleteAccount()} disabled={deleteConfirmation !== "DELETE" || deleting}>{deleting ? "Deleting…" : "Delete permanently"}</button></div></section></div>}
    </>
  );
}
