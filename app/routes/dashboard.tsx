import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../auth/AuthContext";
import { getTeacherProfile, getTeacherStats } from "../models/teacherModel";
import type { UserProfile, TeacherStats } from "../models/teacherModel";
import { getCoursesByTeacher } from "../models/courseModel";
import type { Course } from "../models/courseModel";



// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  studentName: string;
  studentAvatar: string;
  activityType: string;
  courseName: string;
  activityDetails: any;
  timestamp: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

const formatDate = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

const timeAgo = (ts: any): string => {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const activityLabel = (item: ActivityItem): { action: string; detail: string } => {
  switch (item.activityType) {
    case "lesson_completed":
      return { action: "completed", detail: item.activityDetails?.lessonTitle || "a lesson" };
    case "exercise_completed":
      return { action: "scored", detail: `${item.activityDetails?.score ?? 0}% on ${item.activityDetails?.exerciseTitle || "exercise"}` };
    case "exam_completed":
      return { action: item.activityDetails?.passed ? "passed" : "attempted", detail: item.activityDetails?.examTitle || "an exam" };
    case "question_asked":
      return { action: "asked a question", detail: `in ${item.courseName}` };
    case "assignment_submitted":
      return { action: "submitted", detail: item.activityDetails?.assignmentTitle || "assignment" };
    case "course_enrolled":
      return { action: "enrolled in", detail: item.courseName };
    default:
      return { action: "activity in", detail: item.courseName };
  }
};

const LEVEL_COLORS: Record<string, string> = {
  A1: "#6366f1", A2: "#8b5cf6", B1: "#3b82f6", B2: "#06b6d4",
  C1: "#10b981", C2: "#f59e0b",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Skeleton = ({ w = "100%", h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchAll(user.uid);
  }, [user]);

  const fetchAll = async (uid: string) => {
    try {
      const [profData, statsData, coursesData] = await Promise.all([
        getTeacherProfile(uid),
        getTeacherStats(uid),
        getCoursesByTeacher(uid),
        fetchActivities(uid),
      ]);
      setProfile(profData);
      setStats(statsData);
      setCourses(coursesData);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async (uid: string) => {
    try {
      const q = query(
        collection(db, "users", uid, "student_activities"),
        orderBy("timestamp", "desc"),
        limit(10)
      );
      const snap = await getDocs(q);
      const list: ActivityItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ActivityItem));
      setActivities(list);
    } catch {
      // student_activities may not exist yet
      setActivities([]);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const totalActiveStudents = courses.reduce((sum, c) => sum + (c.totalStudents || 0), 0);
  const totalLessons = courses.reduce((sum, c) => sum + (c.totalLessons || 0), 0);
  const totalExercises = courses.reduce((sum, c) => sum + (c.totalExercises || 0), 0);
  const totalExams = courses.reduce((sum, c) => sum + (c.totalExams || 0), 0);
  const draftCoursesCount = courses.filter(c => !c.published).length;
  const publishedCoursesCount = courses.filter(c => c.published).length;

  const firstName = profile?.name?.split(" ")[0] || user?.displayName?.split(" ")[0] || "Teacher";
  const avatarUrl = profile?.avatar || user?.photoURL || "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #f5f6fa; }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important; }
        .course-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.10) !important; }
        .nav-link:hover { color: #111 !important; }
        .btn-primary:hover { background: #16a34a !important; }
        .activity-row:hover { background: #f9fafb !important; }
        .manage-btn:hover { background: #22c55e !important; color: white !important; border-color: #22c55e !important; }
        .profile-menu-item:hover { background: #f3f4f6 !important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'DM Sans', sans-serif" }}>

    

        {/* ── Main ── */}
        <div style={{ padding: "28px 32px", maxWidth: 1000, margin: "0 auto" }}>

          {/* ── Content ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Hero / Welcome banner */}
            <div style={{ background: "white", borderRadius: 16, padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", animation: "fadeUp 0.4s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ position: "relative" }}>
                  <button 
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", background: "#e5e7eb", border: "3px solid #22c55e", flexShrink: 0, cursor: "pointer", padding: 0 }}
                  >
                    {avatarUrl
                      ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 22, fontWeight: 700 }}>{firstName[0]}</div>}
                  </button>

                  {/* Profile Dropdown */}
                  {profileMenuOpen && (
                    <>
                      <div 
                        style={{ position: "fixed", inset: 0, zIndex: 100 }} 
                        onClick={() => setProfileMenuOpen(false)} 
                      />
                      <div style={{ 
                        position: "absolute", top: "calc(100% + 10px)", left: 0, 
                        background: "white", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", 
                        border: "1px solid #e5e7eb", width: 200, zIndex: 110, overflow: "hidden" 
                      }}>
                        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{profile?.name || user?.displayName || "Teacher"}</p>
                          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{user?.email}</p>
                        </div>
                        <Link to="/settings" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", fontSize: 13, color: "#374151", textDecoration: "none" }} className="profile-menu-item">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          Account Settings
                        </Link>
                        <button 
                          onClick={handleLogout}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", fontSize: 13, color: "#ef4444", background: "none", border: "none", borderTop: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }} 
                          className="profile-menu-item"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                          Log Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{getGreeting()}, {profile?.name || firstName}</h1>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{formatDate()}</p>
                </div>
              </div>
              <Link to="/courses/create" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#22c55e", color: "white", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600, transition: "background 0.15s" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create New Course
              </Link>
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                {
                  label: "Total Courses",
                  value: courses.length,
                  sub: `${publishedCoursesCount} active · ${draftCoursesCount} draft`,
                  trend: "up",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  ),
                  color: "#6366f1", bg: "#eef2ff",
                },
                {
                  label: "Active Students",
                  value: totalActiveStudents,
                  sub: "Total enrolled across all courses",
                  trend: "up",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  ),
                  color: "#3b82f6", bg: "#eff6ff",
                },
                {
                  label: "Lessons Created",
                  value: totalLessons,
                  sub: `${totalExercises} exercises · ${totalExams} exams`,
                  trend: "neutral",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                  ),
                  color: "#10b981", bg: "#ecfdf5",
                },
                {
                  label: "Courses Undone",
                  value: draftCoursesCount,
                  sub: `${publishedCoursesCount} Published`,
                  trend: draftCoursesCount === 0 ? "neutral" : "up",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  ),
                  color: "#f59e0b", bg: "#fffbeb",
                },
              ].map((card, i) => (
                <div key={i} className="stat-card" style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition: "transform 0.2s, box-shadow 0.2s", animation: `fadeUp 0.4s ease ${i * 0.07}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {loading ? <Skeleton w={22} h={22} r={4} /> : card.icon}
                    </div>
                    {!loading && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: card.trend === "up" ? "#10b981" : card.trend === "down" ? "#ef4444" : "#9ca3af", background: card.trend === "up" ? "#ecfdf5" : card.trend === "down" ? "#fef2f2" : "#f3f4f6", padding: "2px 8px", borderRadius: 20 }}>
                        {card.trend === "up" ? "▲" : card.trend === "down" ? "▼" : "—"}
                      </span>
                    )}
                  </div>
                  {loading ? <Skeleton h={28} w="60%" /> : <div style={{ fontSize: 26, fontWeight: 700, color: "#111", lineHeight: 1.1 }}>{card.value}</div>}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{card.label}</div>
                  {loading ? <Skeleton h={12} w="80%" r={6} /> : <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>{card.sub}</div>}
                </div>
              ))}
            </div>

            {/* Recent Courses */}
            <div style={{ background: "white", borderRadius: 16, padding: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Recent Courses</h2>
                <Link to="/courses" style={{ fontSize: 13, fontWeight: 600, color: "#22c55e", textDecoration: "none" }}>View All</Link>
              </div>

              {loading ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                      <Skeleton h={140} r={0} />
                      <div style={{ padding: 14 }}><Skeleton h={14} /><Skeleton h={12} w="60%" /></div>
                    </div>
                  ))}
                </div>
              ) : courses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#9ca3af" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block" }}>
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                  <p style={{ fontSize: 14 }}>No courses yet. Create your first course!</p>
                  <Link to="/courses/create" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", background: "#22c55e", color: "white", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>+ Create Course</Link>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {courses.slice(0, 3).map((course, i) => (
                    <div key={course.courseId} className="course-card" style={{ borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", background: "white", transition: "transform 0.2s, box-shadow 0.2s", animation: `fadeUp 0.4s ease ${i * 0.08}s both` }}>
                      {/* Thumbnail */}
                      <div style={{ position: "relative", height: 140, background: "#f3f4f6", overflow: "hidden" }}>
                        {course.thumbnail
                          ? <img src={course.thumbnail} alt={course.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#e0e7ff,#dbeafe)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            </div>}
                        {/* Level badge */}
                        {course.level && (
                          <span style={{ position: "absolute", top: 10, right: 10, background: LEVEL_COLORS[course.level] || "#6b7280", color: "white", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>
                            {course.level}
                          </span>
                        )}
                        {/* Draft badge */}
                        {!course.published && (
                          <span style={{ position: "absolute", top: 10, left: 10, background: "#f59e0b", color: "white", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>
                            Draft
                          </span>
                        )}
                      </div>

                      <div style={{ padding: "14px" }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.4, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {course.title}
                        </h3>
                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>
                          <span>📚 {course.totalLessons ?? 0} Lessons</span>
                          <span>👥 {course.totalStudents ?? 0} Students</span>
                        </div>

                        {/* Progress bar placeholder */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                            <span>Student Progress</span>
                            <span style={{ color: "#22c55e", fontWeight: 600 }}>{course.averageProgress ?? 0}%</span>
                          </div>
                          <div style={{ height: 5, background: "#f3f4f6", borderRadius: 10, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${course.averageProgress ?? 0}%`, background: "#22c55e", borderRadius: 10, transition: "width 0.6s ease" }} />
                          </div>
                        </div>

                        <Link to="/courses/create" state={course} className="manage-btn" style={{ display: "block", textAlign: "center", padding: "8px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#374151", textDecoration: "none", transition: "all 0.15s" }}>
                          Manage Course
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
