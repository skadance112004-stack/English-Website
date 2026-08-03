import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../auth/AuthContext";
import { getTeacherProfile, getTeacherStats } from "../models/teacherModel";
import type { TeacherStats, UserProfile } from "../models/teacherModel";
import { getCoursesByTeacher } from "../models/courseModel";
import type { Course } from "../models/courseModel";

interface ActivityItem {
  id: string;
  studentName: string;
  studentAvatar?: string;
  activityType: string;
  courseName?: string;
  activityDetails?: Record<string, unknown>;
  timestamp?: { toDate?: () => Date } | Date | string | number;
}

const LEVEL_COLORS: Record<string, string> = {
  A1: "#4f46e5",
  A2: "#7c3aed",
  B1: "#2563eb",
  B2: "#0891b2",
  C1: "#047857",
  C2: "#b45309",
};

const numberFormatter = new Intl.NumberFormat("en-US");

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const formatDate = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

const initialsFor = (name?: string) =>
  (name || "Student")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const timeAgo = (timestamp?: ActivityItem["timestamp"]) => {
  if (!timestamp) return "";

  const date = typeof (timestamp as { toDate?: () => Date }).toDate === "function"
    ? (timestamp as { toDate: () => Date }).toDate()
    : new Date(timestamp as Date | string | number);
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - milliseconds) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const activityLabel = (item: ActivityItem) => {
  const details = item.activityDetails || {};
  const value = (key: string) => typeof details[key] === "string" ? details[key] : "";

  switch (item.activityType) {
    case "lesson_completed":
      return { action: "completed", detail: value("lessonTitle") || "a lesson" };
    case "exercise_completed": {
      const score = typeof details.score === "number" ? `${details.score}%` : "an exercise";
      return { action: "completed", detail: value("exerciseTitle") ? `${value("exerciseTitle")} · ${score}` : score };
    }
    case "exam_completed":
      return { action: details.passed ? "passed" : "attempted", detail: value("examTitle") || "an exam" };
    case "question_asked":
      return { action: "asked a question", detail: item.courseName || "in a course" };
    case "assignment_submitted":
      return { action: "submitted", detail: value("assignmentTitle") || "an assignment" };
    case "course_enrolled":
      return { action: "joined", detail: item.courseName || "a course" };
    default:
      return { action: "was active in", detail: item.courseName || "a course" };
  }
};

const clampProgress = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.min(100, Math.max(0, numericValue)) : 0;
};

const Skeleton = ({ width = "100%", height = 16 }: { width?: string | number; height?: number }) => (
  <span className="dashboard-skeleton" style={{ width, height }} aria-hidden="true" />
);

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchActivities = useCallback(async (uid: string) => {
    try {
      const activityQuery = query(
        collection(db, "users", uid, "student_activities"),
        orderBy("timestamp", "desc"),
        limit(6),
      );
      const snapshot = await getDocs(activityQuery);
      return snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }) as ActivityItem);
    } catch {
      // The activity collection is optional for teachers without student activity yet.
      return [] as ActivityItem[];
    }
  }, []);

  const fetchDashboard = useCallback(async (uid: string) => {
    setLoading(true);
    setLoadError("");

    try {
      const [profileData, statsData, coursesData, activityData] = await Promise.all([
        getTeacherProfile(uid),
        getTeacherStats(uid),
        getCoursesByTeacher(uid),
        fetchActivities(uid),
      ]);
      setProfile(profileData);
      setStats(statsData);
      setCourses(coursesData);
      setActivities(activityData);
    } catch {
      setLoadError("We couldn't load your dashboard. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [fetchActivities]);

  useEffect(() => {
    if (!user) return;
    void fetchDashboard(user.uid);
  }, [fetchDashboard, user]);

  const firstName = profile?.name?.split(" ")[0] || user?.displayName?.split(" ")[0] || "Teacher";
  const displayName = profile?.name || user?.displayName || firstName;
  const avatarUrl = profile?.avatar || user?.photoURL || "";
  const totalEnrollments = courses.reduce((sum, course) => sum + (course.totalStudents || 0), 0);
  const totalLessons = courses.reduce((sum, course) => sum + (course.totalLessons || 0), 0);
  const draftCourses = courses.filter((course) => !course.published).length;
  const publishedCourses = courses.filter((course) => course.published).length;
  const completionRate = clampProgress(stats?.averageCompletionRate);

  const statCards = [
    {
      label: "Total courses",
      value: stats?.totalCourses ?? courses.length,
      detail: `${publishedCourses} published · ${draftCourses} drafts`,
      color: "violet",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
    },
    {
      label: "Active students",
      value: stats?.activeStudents ?? totalEnrollments,
      detail: stats ? "Active across your courses" : "Total enrollments across courses",
      color: "blue",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
      label: "Lessons created",
      value: stats?.lessonsCreated ?? totalLessons,
      detail: `${stats?.exercisesCreated ?? courses.reduce((sum, course) => sum + (course.totalExercises || 0), 0)} exercises`,
      color: "emerald",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    },
    {
      label: "Completion rate",
      value: `${completionRate}%`,
      detail: "Average student progress",
      color: "amber",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>,
    },
  ];

  return (
    <>
      <style>{`
        .dashboard-page { min-height: calc(100vh - 60px); background: #f6f8fb; color: #172033; font-family: 'DM Sans', sans-serif; }
        .dashboard-container { width: min(100%, 1280px); margin: 0 auto; padding: 32px; }
        .dashboard-stack { display: grid; gap: 24px; }
        .dashboard-welcome, .dashboard-panel, .dashboard-activity, .dashboard-quick-actions, .dashboard-stat { background: #fff; border: 1px solid #e5eaf1; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
        .dashboard-welcome { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-radius: 18px; padding: 24px 28px; }
        .dashboard-person { display: flex; align-items: center; gap: 16px; min-width: 0; }
        .dashboard-avatar { display: grid; place-items: center; width: 58px; height: 58px; flex: 0 0 58px; overflow: hidden; border: 3px solid #d9fbe5; border-radius: 999px; background: #16a34a; color: #fff; font-size: 20px; font-weight: 700; text-decoration: none; }
        .dashboard-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .dashboard-eyebrow { margin: 0 0 4px; color: #667085; font-size: 13px; font-weight: 600; }
        .dashboard-title { margin: 0; color: #172033; font-size: clamp(22px, 3vw, 28px); line-height: 1.2; letter-spacing: -.025em; }
        .dashboard-date { margin: 5px 0 0; color: #667085; font-size: 14px; }
        .dashboard-primary-button, .dashboard-secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 10px 16px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; transition: background .15s ease, border-color .15s ease, transform .15s ease; }
        .dashboard-primary-button { background: #15803d; color: #fff; border: 1px solid #15803d; }
        .dashboard-primary-button:hover { background: #166534; border-color: #166534; transform: translateY(-1px); }
        .dashboard-secondary-button { background: #fff; color: #175c36; border: 1px solid #b7e7c8; }
        .dashboard-secondary-button:hover { background: #f0fdf4; border-color: #86d6a6; }
        .dashboard-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
        .dashboard-stat { min-width: 0; border-radius: 16px; padding: 18px; }
        .dashboard-stat-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
        .dashboard-stat-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; }
        .dashboard-stat-icon svg { width: 22px; height: 22px; }
        .dashboard-stat-icon.violet { color: #5b46d8; background: #f1efff; }
        .dashboard-stat-icon.blue { color: #2563eb; background: #eff6ff; }
        .dashboard-stat-icon.emerald { color: #047857; background: #ecfdf5; }
        .dashboard-stat-icon.amber { color: #b45309; background: #fff7ed; }
        .dashboard-stat-value { color: #172033; font-size: 28px; font-weight: 750; line-height: 1; letter-spacing: -.04em; }
        .dashboard-stat-label { margin-top: 7px; color: #475467; font-size: 14px; font-weight: 650; }
        .dashboard-stat-detail { min-height: 17px; margin-top: 6px; color: #667085; font-size: 12px; line-height: 1.4; }
        .dashboard-content-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
        .dashboard-panel, .dashboard-activity, .dashboard-quick-actions { border-radius: 16px; }
        .dashboard-panel { padding: 22px; }
        .dashboard-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
        .dashboard-panel-title { margin: 0; color: #172033; font-size: 17px; letter-spacing: -.015em; }
        .dashboard-inline-link { color: #167442; font-size: 13px; font-weight: 700; text-decoration: none; }
        .dashboard-inline-link:hover { color: #14532d; text-decoration: underline; }
        .dashboard-course-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
        .dashboard-course-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e5eaf1; border-radius: 13px; background: #fff; transition: box-shadow .18s ease, transform .18s ease; }
        .dashboard-course-card:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(15, 23, 42, .08); }
        .dashboard-course-image { position: relative; height: 126px; overflow: hidden; background: linear-gradient(135deg, #e7edff, #def7ed); }
        .dashboard-course-image img { width: 100%; height: 100%; object-fit: cover; }
        .dashboard-course-placeholder { display: grid; width: 100%; height: 100%; place-items: center; color: #667eea; }
        .dashboard-course-placeholder svg { width: 32px; height: 32px; }
        .dashboard-badge { position: absolute; top: 10px; padding: 4px 8px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 750; line-height: 1; }
        .dashboard-level { right: 10px; }
        .dashboard-draft { left: 10px; background: #a16207; }
        .dashboard-course-content { display: flex; flex: 1; flex-direction: column; padding: 14px; }
        .dashboard-course-title { display: -webkit-box; min-height: 38px; margin: 0; overflow: hidden; color: #172033; font-size: 14px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .dashboard-course-meta { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 10px 0 14px; color: #667085; font-size: 12px; }
        .dashboard-progress-label { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; color: #667085; font-size: 12px; }
        .dashboard-progress-label strong { color: #167442; }
        .dashboard-progress-track { height: 6px; overflow: hidden; border-radius: 999px; background: #eaf0ec; }
        .dashboard-progress-value { height: 100%; border-radius: inherit; background: #22a35a; transition: width .4s ease; }
        .dashboard-manage-course { margin-top: auto; padding-top: 16px; }
        .dashboard-manage-course a { display: block; padding: 8px 10px; border: 1px solid #d7e0e9; border-radius: 8px; color: #344054; font-size: 12px; font-weight: 700; text-align: center; text-decoration: none; transition: background .15s ease, border-color .15s ease; }
        .dashboard-manage-course a:hover { border-color: #75c995; background: #f0fdf4; color: #14532d; }
        .dashboard-aside { display: grid; gap: 16px; }
        .dashboard-activity { overflow: hidden; }
        .dashboard-activity-header { display: flex; align-items: center; justify-content: space-between; padding: 17px 18px; border-bottom: 1px solid #e5eaf1; }
        .dashboard-activity-list { display: grid; }
        .dashboard-activity-row { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; padding: 14px 18px; border-bottom: 1px solid #edf1f5; }
        .dashboard-activity-row:last-child { border-bottom: 0; }
        .dashboard-activity-avatar { display: grid; place-items: center; width: 32px; height: 32px; overflow: hidden; border-radius: 999px; background: #e9eff5; color: #475467; font-size: 10px; font-weight: 750; }
        .dashboard-activity-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .dashboard-activity-copy { min-width: 0; color: #475467; font-size: 13px; line-height: 1.35; }
        .dashboard-activity-copy strong { color: #344054; }
        .dashboard-activity-detail { display: block; overflow: hidden; color: #667085; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .dashboard-activity-time { display: block; margin-top: 4px; color: #7b8798; font-size: 11px; font-weight: 600; }
        .dashboard-activity-empty, .dashboard-empty-courses { display: grid; place-items: center; gap: 8px; color: #667085; text-align: center; }
        .dashboard-activity-empty { min-height: 178px; padding: 20px; font-size: 13px; }
        .dashboard-empty-courses { min-height: 260px; padding: 30px 20px; font-size: 14px; }
        .dashboard-empty-courses svg, .dashboard-activity-empty svg { color: #9dacbb; }
        .dashboard-quick-actions { padding: 18px; }
        .dashboard-quick-actions p { margin: 4px 0 14px; color: #667085; font-size: 12px; line-height: 1.5; }
        .dashboard-action-list { display: grid; gap: 8px; }
        .dashboard-action-link { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 11px; border: 1px solid #e1e8ef; border-radius: 9px; color: #344054; font-size: 13px; font-weight: 700; text-decoration: none; }
        .dashboard-action-link:hover { border-color: #b7e7c8; background: #f6fdf8; color: #14532d; }
        .dashboard-alert { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 16px; border: 1px solid #fecaca; border-radius: 12px; background: #fff7f7; color: #991b1b; font-size: 14px; }
        .dashboard-alert button { border: 0; background: transparent; color: #991b1b; font: inherit; font-weight: 750; text-decoration: underline; cursor: pointer; }
        .dashboard-skeleton { display: block; border-radius: 7px; background: linear-gradient(90deg, #eef2f6 25%, #f8fafc 50%, #eef2f6 75%); background-size: 200% 100%; animation: dashboard-shimmer 1.35s infinite; }
        @keyframes dashboard-shimmer { to { background-position: -200% 0; } }
        @media (max-width: 1060px) { .dashboard-container { padding: 28px 24px; } .dashboard-content-grid { grid-template-columns: minmax(0, 1fr) 280px; } }
        @media (max-width: 900px) { .dashboard-content-grid { grid-template-columns: 1fr; } .dashboard-aside { grid-template-columns: minmax(0, 1fr) minmax(220px, .75fr); } .dashboard-activity { min-height: 100%; } }
        @media (max-width: 720px) { .dashboard-container { padding: 20px 16px 28px; } .dashboard-welcome { align-items: flex-start; flex-direction: column; padding: 20px; } .dashboard-welcome .dashboard-primary-button { width: 100%; } .dashboard-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-aside { grid-template-columns: 1fr; } }
        @media (max-width: 460px) { .dashboard-stats, .dashboard-course-grid { grid-template-columns: 1fr; } .dashboard-panel { padding: 17px; } .dashboard-panel-header { align-items: flex-start; flex-direction: column; gap: 6px; } .dashboard-title { font-size: 23px; } }
        @media (prefers-reduced-motion: reduce) { .dashboard-page *, .dashboard-page *::before, .dashboard-page *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
      `}</style>

      <main className="dashboard-page" aria-busy={loading}>
        <div className="dashboard-container">
          <div className="dashboard-stack">
            <section className="dashboard-welcome" aria-labelledby="dashboard-heading">
              <div className="dashboard-person">
                <Link className="dashboard-avatar" to="/settings" aria-label="Open account settings">
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : initialsFor(displayName)}
                </Link>
                <div>
                  <p className="dashboard-eyebrow">{formatDate()}</p>
                  <h1 className="dashboard-title" id="dashboard-heading">{getGreeting()}, {firstName}</h1>
                  <p className="dashboard-date">Here is a clear view of your teaching workspace.</p>
                </div>
              </div>
              <Link className="dashboard-primary-button" to="/courses/create">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create course
              </Link>
            </section>

            {loadError && (
              <div className="dashboard-alert" role="alert">
                <span>{loadError}</span>
                {user && <button type="button" onClick={() => void fetchDashboard(user.uid)}>Try again</button>}
              </div>
            )}

            <section className="dashboard-stats" aria-label="Course overview">
              {statCards.map((card) => (
                <article className="dashboard-stat" key={card.label}>
                  <div className="dashboard-stat-top"><span className={`dashboard-stat-icon ${card.color}`}>{card.icon}</span></div>
                  {loading ? <Skeleton width="58%" height={29} /> : <div className="dashboard-stat-value">{loadError ? "—" : typeof card.value === "number" ? numberFormatter.format(card.value) : card.value}</div>}
                  <div className="dashboard-stat-label">{card.label}</div>
                  {loading ? <div style={{ marginTop: 7 }}><Skeleton width="76%" height={12} /></div> : <div className="dashboard-stat-detail">{loadError ? "Unavailable until reloaded" : card.detail}</div>}
                </article>
              ))}
            </section>

            <div className="dashboard-content-grid">
              <section className="dashboard-panel" aria-labelledby="recent-courses-heading">
                <div className="dashboard-panel-header">
                  <h2 className="dashboard-panel-title" id="recent-courses-heading">Recent courses</h2>
                  <Link className="dashboard-inline-link" to="/courses">View all courses</Link>
                </div>

                {loading ? (
                  <div className="dashboard-course-grid">
                    {[0, 1, 2].map((index) => <div className="dashboard-course-card" key={index}><Skeleton height={126} /><div style={{ padding: 14, display: "grid", gap: 10 }}><Skeleton height={16} /><Skeleton width="68%" height={12} /><Skeleton height={32} /></div></div>)}
                  </div>
                ) : loadError ? (
                  <div className="dashboard-empty-courses"><span>Course data is unavailable right now.</span>{user && <button className="dashboard-primary-button" type="button" onClick={() => void fetchDashboard(user.uid)}>Try again</button>}</div>
                ) : courses.length === 0 ? (
                  <div className="dashboard-empty-courses">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    <span>Your course library is ready for its first course.</span>
                    <Link className="dashboard-primary-button" to="/courses/create">Create your first course</Link>
                  </div>
                ) : (
                  <div className="dashboard-course-grid">
                    {courses.slice(0, 3).map((course) => {
                      const progress = clampProgress((course as Course & { averageProgress?: number }).averageProgress);
                      return (
                        <article className="dashboard-course-card" key={course.courseId}>
                          <div className="dashboard-course-image">
                            {course.thumbnail ? <img src={course.thumbnail} alt="" /> : <div className="dashboard-course-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>}
                            {course.level && <span className="dashboard-badge dashboard-level" style={{ background: LEVEL_COLORS[course.level] || "#475467" }}>{course.level}</span>}
                            {!course.published && <span className="dashboard-badge dashboard-draft">Draft</span>}
                          </div>
                          <div className="dashboard-course-content">
                            <h3 className="dashboard-course-title">{course.title || "Untitled course"}</h3>
                            <div className="dashboard-course-meta"><span>{course.totalLessons ?? 0} lessons</span><span>{course.totalStudents ?? 0} students</span></div>
                            <div className="dashboard-progress-label"><span>Student progress</span><strong>{progress}%</strong></div>
                            <div className="dashboard-progress-track" aria-label={`${progress}% average student progress`}><div className="dashboard-progress-value" style={{ width: `${progress}%` }} /></div>
                            <div className="dashboard-manage-course"><Link to="/courses/create" state={{ courseId: course.courseId, mode: "edit" }}>Manage course</Link></div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <aside className="dashboard-aside" aria-label="Dashboard shortcuts">
                <section className="dashboard-activity" aria-labelledby="activity-heading">
                  <div className="dashboard-activity-header"><h2 className="dashboard-panel-title" id="activity-heading">Student activity</h2></div>
                  {loading ? <div style={{ display: "grid", gap: 14, padding: 18 }}>{[0, 1, 2, 3].map((index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10 }}><Skeleton width={32} height={32} /><div style={{ display: "grid", gap: 6 }}><Skeleton height={13} /><Skeleton width="65%" height={11} /></div></div>)}</div> : activities.length ? <div className="dashboard-activity-list">{activities.map((activity) => { const label = activityLabel(activity); return <div className="dashboard-activity-row" key={activity.id}><span className="dashboard-activity-avatar">{activity.studentAvatar ? <img src={activity.studentAvatar} alt="" /> : initialsFor(activity.studentName)}</span><div className="dashboard-activity-copy"><span><strong>{activity.studentName || "A student"}</strong> {label.action}</span><span className="dashboard-activity-detail">{label.detail}</span>{timeAgo(activity.timestamp) && <time className="dashboard-activity-time">{timeAgo(activity.timestamp)}</time>}</div></div>; })}</div> : <div className="dashboard-activity-empty"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span>Activity will appear here as students learn.</span></div>}
                </section>

                <section className="dashboard-quick-actions" aria-labelledby="quick-actions-heading">
                  <h2 className="dashboard-panel-title" id="quick-actions-heading">Quick actions</h2>
                  <p>Keep your courses moving without leaving the dashboard.</p>
                  <div className="dashboard-action-list">
                    <Link className="dashboard-action-link" to="/courses/create"><span>Create a course</span><span aria-hidden="true">→</span></Link>
                    <Link className="dashboard-action-link" to="/courses"><span>Manage courses</span><span aria-hidden="true">→</span></Link>
                    <Link className="dashboard-action-link" to="/settings#notifs"><span>Notification preferences</span><span aria-hidden="true">→</span></Link>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
