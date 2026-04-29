import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { getCoursesByTeacher, deleteCourse, type Course as CourseModel } from "../models/courseModel";

// ─── Types ─────────────────────────────────────────────────────────────────────
type CourseStatus = "Published" | "Draft" | "Archived";
type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

interface Course {
  id: string;
  title: string;
  description: string;
  status: CourseStatus;
  level: Level;
  thumbnail: string;
  lessons: number;
  students: number;
  updatedAt: string;
  progress: number;
}

// ─── Mock data ──────────────────────────────────────────────────────────────────
const MOCK_COURSES: Course[] = [
  {
    id: "1", title: "Business English: Negotiation Skills",
    description: "Master the art of negotiation with key phrases, strategies, and role-play scenarios.",
    status: "Published", level: "B2",
    thumbnail: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80",
    lessons: 12, students: 45, updatedAt: "2d ago", progress: 85,
  },
  {
    id: "2", title: "Advanced Grammar Structures",
    description: "Deep dive into complex grammar rules, conditionals, and passive voice usage.",
    status: "Published", level: "C1",
    thumbnail: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80",
    lessons: 24, students: 128, updatedAt: "5d ago", progress: 42,
  },
  {
    id: "3", title: "Public Speaking Fundamentals",
    description: "Build confidence and learn techniques for effective public presentations.",
    status: "Draft", level: "B1",
    thumbnail: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=600&q=80",
    lessons: 8, students: 0, updatedAt: "1w ago", progress: 0,
  },
  {
    id: "4", title: "Email Etiquette for Professionals",
    description: "Write clear, concise, and professional emails for any business context.",
    status: "Published", level: "A2",
    thumbnail: "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?w=600&q=80",
    lessons: 6, students: 210, updatedAt: "3d ago", progress: 92,
  },
  {
    id: "5", title: "IELTS Exam Preparation",
    description: "Comprehensive guide to achieving high band scores in all four modules.",
    status: "Published", level: "C2",
    thumbnail: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&q=80",
    lessons: 32, students: 56, updatedAt: "12h ago", progress: 15,
  },
  {
    id: "6", title: "Travel English Essentials",
    description: "Essential vocabulary and phrases for navigating airports, hotels, and restaurants.",
    status: "Archived", level: "A1",
    thumbnail: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&q=80",
    lessons: 10, students: 890, updatedAt: "1mo ago", progress: 100,
  },
];

const TEMPLATES = [
  { name: "Exam Prep Starter",  color: "linear-gradient(135deg,#3b82f6,#06b6d4)" },
  { name: "Business Module",    color: "linear-gradient(135deg,#8b5cf6,#ec4899)" },
  { name: "Vocabulary Drill",   color: "linear-gradient(135deg,#f59e0b,#ef4444)" },
  { name: "Grammar Focus",      color: "linear-gradient(135deg,#22c55e,#14b8a6)" },
];

// ─── Status badge ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<CourseStatus, { bg: string; color: string; dot: string }> = {
  Published: { bg: "#22c55e", color: "white", dot: "#16a34a" },
  Draft:     { bg: "#6b7280", color: "white", dot: "#4b5563" },
  Archived:  { bg: "#f59e0b", color: "white", dot: "#d97706" },
};

function StatusBadge({ status }: { status: CourseStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:5, background:c.bg, borderRadius:4, padding:"3px 8px" }}>
      <span style={{ fontSize:10, fontWeight:700, color:c.color, textTransform:"uppercase", letterSpacing:"0.05em" }}>{status}</span>
    </div>
  );
}

// ─── Level badge ────────────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: Level }) {
  return (
    <div style={{ width:28, height:28, borderRadius:"50%", background:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#111", boxShadow:"0 1px 4px rgba(0,0,0,0.15)" }}>
      {level}
    </div>
  );
}

// ─── Course Card ────────────────────────────────────────────────────────────────
function CourseCard({ course, onManage }: { course: Course; onManage: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);

  const progressColor = course.progress === 100 ? "#22c55e" : course.progress >= 50 ? "#22c55e" : course.progress > 0 ? "#22c55e" : "#e5e7eb";
  const progressText = `${course.progress}%`;
  const progressTextColor = course.progress === 0 ? "#9ca3af" : "#22c55e";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background:"white", borderRadius:12, overflow:"hidden", border:"1px solid #e5e7eb", transition:"box-shadow 0.2s, transform 0.2s", boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.12)" : "0 1px 4px rgba(0,0,0,0.06)", transform: hovered ? "translateY(-2px)" : "none" }}
    >
      {/* Thumbnail */}
      <div style={{ position:"relative", height:170, overflow:"hidden" }}>
        <img src={course.thumbnail} alt={course.title} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform 0.3s", transform: hovered ? "scale(1.04)" : "scale(1)" }} />
        {/* Status badge top-left */}
        <div style={{ position:"absolute", top:12, left:12 }}>
          <StatusBadge status={course.status} />
        </div>
        {/* Level badge top-right */}
        <div style={{ position:"absolute", top:12, right:12 }}>
          <LevelBadge level={course.level} />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding:"16px 16px 14px" }}>
        <h3 style={{ fontSize:15, fontWeight:700, color:"#111", margin:"0 0 6px", lineHeight:1.35 }}>{course.title}</h3>
        <p style={{ fontSize:13, color:"#6b7280", lineHeight:1.55, margin:"0 0 14px", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{course.description}</p>

        {/* Stats row */}
        <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:14, borderTop:"1px solid #f3f4f6", paddingTop:12 }}>
          {[
            { icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>, val: course.lessons },
            { icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, val: course.students },
            { icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, val: course.updatedAt },
          ].map((s, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:4, flex:1 }}>
              {s.icon}
              <span style={{ fontSize:12, color:"#6b7280" }}>{s.val}</span>
              {i < 2 && <div style={{ width:1, height:12, background:"#e5e7eb", margin:"0 6px 0 2px" }} />}
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>Student Progress</span>
            <span style={{ fontSize:12, fontWeight:700, color:progressTextColor }}>{progressText}</span>
          </div>
          <div style={{ height:5, background:"#f3f4f6", borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${course.progress}%`, background:"#22c55e", borderRadius:3, transition:"width 0.5s ease" }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button
            onClick={() => onManage(course.id)}
            style={{ flex:1, padding:"9px 0", background:"white", border:"1.5px solid #22c55e", borderRadius:8, fontSize:12, fontWeight:700, color:"#22c55e", cursor:"pointer", letterSpacing:"0.06em", transition:"all 0.15s" }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.background="#22c55e"; (e.currentTarget as HTMLElement).style.color="white"; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.background="white"; (e.currentTarget as HTMLElement).style.color="#22c55e"; }}
          >
            MANAGE
          </button>
          <button style={{ width:36, height:36, border:"1px solid #e5e7eb", borderRadius:8, background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Range Slider ───────────────────────────────────────────────────────────────
function RangeSlider({ min, max, value, onChange }: { min:number; max:number; value:number; onChange:(v:number)=>void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ position:"relative", height:20, display:"flex", alignItems:"center" }}>
      <div style={{ width:"100%", height:4, background:"#e5e7eb", borderRadius:2, position:"relative" }}>
        <div style={{ position:"absolute", left:0, width:`${pct}%`, height:"100%", background:"#22c55e", borderRadius:2 }} />
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)}
        style={{ position:"absolute", width:"100%", height:"100%", opacity:0, cursor:"pointer", margin:0 }} />
      <div style={{ position:"absolute", left:`${pct}%`, transform:"translateX(-50%)", width:14, height:14, borderRadius:"50%", background:"#22c55e", border:"2px solid white", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", pointerEvents:"none" }} />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function CoursesManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Filter state
  const [searchQ, setSearchQ] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<CourseStatus>>(new Set(["Published","Draft","Archived"]));
  const [levelFilter, setLevelFilter] = useState<Level | null>("B2");
  const [category, setCategory] = useState("Business English");
  const [maxStudents, setMaxStudents] = useState(500);
  const [dateFilter, setDateFilter] = useState<"7d"|"30d"|"custom">("30d");
  const [viewMode, setViewMode] = useState<"grid"|"list">("grid");
  const [sortBy, setSortBy] = useState("Recently Updated");
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCourses() {
      if (!user?.uid) return;
      try {
        const rawCourses = await getCoursesByTeacher(user.uid);
        const mapped: Course[] = rawCourses.map((c: any) => ({
          id: c.courseId,
          title: c.title,
          description: c.description || "",
          status: (c.published ? "Published" : "Draft") as CourseStatus,
          level: (c.level as Level) || "A1",
          thumbnail: c.thumbnail,
          lessons: c.totalLessons || 0,
          students: c.totalStudents || 0,
          updatedAt: c.updatedAt?.seconds ? new Date(c.updatedAt.seconds * 1000).toLocaleDateString() : "Recently",
          progress: 0,
        }));
        setCourses(mapped);
      } catch (err) {
        console.error("Error fetching courses:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCourses();
  }, [user?.uid]);

  const toggleStatus = (s: CourseStatus) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const LEVELS: Level[] = ["A1","A2","B1","B2","C1","C2"];

  const filteredCourses = courses.filter(c => {
    if (searchQ && !c.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (!statusFilters.has(c.status)) return false;
    if (levelFilter && c.level !== levelFilter) return false;
    if (c.students > maxStudents) return false;
    return true;
  });

  const handleManage = (courseId: string) => {
    navigate("/courses/create", { state: { courseId, mode: "edit" } });
  };

  const handleDelete = async (courseId: string) => {
    if (!user?.uid) return;
    if (window.confirm("Are you sure you want to delete this course?")) {
      try {
        await deleteCourse(courseId, user.uid);
        setCourses(courses.filter(c => c.id !== courseId));
      } catch (err) {
        console.error("Failed to delete course:", err);
        alert("Failed to delete course");
      }
    }
  };

  const STATUS_DOT: Record<CourseStatus, string> = {
    Published: "#22c55e",
    Draft: "#9ca3af",
    Archived: "#f59e0b",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif;background:#f5f6fa}
        input,select,textarea,button{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:3px}
        .filter-cb{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:3px 0}
        .filter-cb input{display:none}
        .filter-cb .cb-box{width:16px;height:16px;border-radius:4px;border:1.5px solid #d1d5db;background:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s}
        .filter-cb.checked .cb-box{background:#22c55e;border-color:#22c55e}
        .level-btn{width:36px;height:28px;border-radius:6px;border:1.5px solid #e5e7eb;background:white;font-size:12px;font-weight:600;color:#6b7280;cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif}
        .level-btn.active{background:#22c55e;border-color:#22c55e;color:white}
        .sort-select{appearance:none;border:1px solid #e5e7eb;borderRadius:8px;padding:7px 32px 7px 12px;font-size:13px;color:#374151;background:white url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' strokeWidth='2' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 10px center;cursor:pointer;outline:none;font-family:'DM Sans',sans-serif}
      `}</style>

      <div style={{ minHeight:"100vh", background:"#f5f6fa", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ display:"flex", gap:24, padding:"28px 32px", alignItems:"flex-start" }}>

          {/* ── Left Sidebar Filter ──────────────────────────────────── */}
          <div style={{ width:214, flexShrink:0, background:"white", borderRadius:12, padding:"18px 16px", border:"1px solid #e5e7eb", position:"sticky", top:88 }}>

            {/* Search */}
            <div style={{ position:"relative", marginBottom:20 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search courses..." style={{ width:"100%", padding:"8px 28px 8px 28px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", color:"#374151" }} />
              {searchQ && (
                <button onClick={() => setSearchQ("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#9ca3af", padding:2, display:"flex" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>

            {/* Status */}
            <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Status</div>
            {(["Published","Draft","Archived"] as CourseStatus[]).map(s => (
              <label key={s} className={`filter-cb${statusFilters.has(s)?" checked":""}`} onClick={() => toggleStatus(s)}>
                <div className="cb-box">
                  {statusFilters.has(s) && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:STATUS_DOT[s], flexShrink:0 }} />
                  <span style={{ fontSize:13, color:"#374151" }}>{s}</span>
                </div>
              </label>
            ))}

            <div style={{ height:1, background:"#f3f4f6", margin:"16px 0" }} />

            {/* Level */}
            <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Level</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:0 }}>
              {LEVELS.map(l => (
                <button key={l} className={`level-btn${levelFilter===l?" active":""}`} onClick={() => setLevelFilter(levelFilter===l?null:l)}>{l}</button>
              ))}
            </div>

            <div style={{ height:1, background:"#f3f4f6", margin:"16px 0" }} />

            {/* Category */}
            <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Category</div>
            <div style={{ position:"relative" }}>
              <select value={category} onChange={e => setCategory(e.target.value)} className="sort-select" style={{ width:"100%", padding:"8px 32px 8px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#374151", background:"white", outline:"none", cursor:"pointer", appearance:"none" }}>
                {["Business English","Academic English","General English","IELTS/TOEFL","Conversation"].map(c=><option key={c}>{c}</option>)}
              </select>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>

            <div style={{ height:1, background:"#f3f4f6", margin:"16px 0" }} />

            {/* Students Range */}
            <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Students Range</div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#6b7280", marginBottom:10 }}>
              <span>0</span><span style={{ fontWeight:600 }}>- {maxStudents >= 500 ? "500+" : maxStudents}</span>
            </div>
            <RangeSlider min={0} max={500} value={maxStudents} onChange={setMaxStudents} />

            <div style={{ height:1, background:"#f3f4f6", margin:"16px 0" }} />

            {/* Date Created */}
            <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Date Created</div>
            {([["7d","Last 7 days"],["30d","Last 30 days"],["custom","Custom Range"]] as [string,string][]).map(([val,label]) => (
              <label key={val} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:8 }} onClick={() => setDateFilter(val as any)}>
                <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${dateFilter===val?"#22c55e":"#d1d5db"}`, background:"white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {dateFilter===val && <div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e" }} />}
                </div>
                <span style={{ fontSize:13, color:"#374151" }}>{label}</span>
              </label>
            ))}

            <div style={{ height:1, background:"#f3f4f6", margin:"16px 0" }} />

            {/* Apply button */}
            <button style={{ width:"100%", padding:"11px 0", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:13, fontWeight:700, cursor:"pointer", transition:"background 0.15s" }}
              onMouseOver={e=>(e.currentTarget.style.background="#16a34a")}
              onMouseOut={e=>(e.currentTarget.style.background="#22c55e")}>
              Apply Filters
            </button>
          </div>

          {/* ── Main content ─────────────────────────────────────────── */}
          <div style={{ flex:1, minWidth:0 }}>

            {/* Header row */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <h1 style={{ fontSize:24, fontWeight:700, color:"#111" }}>My Courses</h1>
                <div style={{ background:"#f3f4f6", borderRadius:20, padding:"3px 10px", fontSize:13, fontWeight:600, color:"#6b7280" }}>{filteredCourses.length}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {/* Sort */}
                <div style={{ position:"relative" }}>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ appearance:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 32px 8px 12px", fontSize:13, color:"#374151", background:"white", outline:"none", cursor:"pointer" }}>
                    {["Recently Updated","Most Students","Title A-Z","Newest First"].map(o=><option key={o}>{o}</option>)}
                  </select>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                {/* View toggle */}
                <div style={{ display:"flex", border:"1px solid #e5e7eb", borderRadius:8, overflow:"hidden" }}>
                  <button onClick={() => setViewMode("grid")} style={{ padding:"7px 10px", background:viewMode==="grid"?"#f3f4f6":"white", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={viewMode==="grid"?"#111":"#9ca3af"} strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </button>
                  <button onClick={() => setViewMode("list")} style={{ padding:"7px 10px", background:viewMode==="list"?"#f3f4f6":"white", border:"none", borderLeft:"1px solid #e5e7eb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={viewMode==="list"?"#111":"#9ca3af"} strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  </button>
                </div>
                {/* Create button */}
                <button onClick={() => navigate("/courses/create")} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 18px", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background 0.15s" }}
                  onMouseOver={e=>(e.currentTarget.style.background="#16a34a")}
                  onMouseOut={e=>(e.currentTarget.style.background="#22c55e")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Create Course
                </button>
              </div>
            </div>

            {/* Course Grid */}
            {filteredCourses.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af", fontSize:14 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ margin:"0 auto 12px", display:"block" }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                No courses match your filters.
              </div>
            ) : viewMode === "grid" ? (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, marginBottom:40 }}>
                {filteredCourses.map(c => <CourseCard key={c.id} course={c} onManage={handleManage}/>)}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:40 }}>
                {filteredCourses.map(c => (
                  <div key={c.id} style={{ background:"white", borderRadius:12, border:"1px solid #e5e7eb", display:"flex", alignItems:"center", gap:0, overflow:"hidden", transition:"box-shadow 0.2s" }}
                    onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)")}
                    onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}>
                    <img src={c.thumbnail} alt={c.title} style={{ width:120, height:80, objectFit:"cover", flexShrink:0 }}/>
                    <div style={{ flex:1, padding:"12px 16px", minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <StatusBadge status={c.status}/>
                        <span style={{ fontSize:10, fontWeight:600, color:"#9ca3af" }}>{c.level}</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#111", marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</div>
                      <div style={{ fontSize:12, color:"#6b7280" }}>{c.lessons} lessons · {c.students} students · {c.updatedAt}</div>
                    </div>
                    <div style={{ padding:"0 16px", minWidth:180 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}><span style={{ fontWeight:600, color:"#374151" }}>Student Progress</span><span style={{ fontWeight:700, color:"#22c55e" }}>{c.progress}%</span></div>
                      <div style={{ height:4, background:"#f3f4f6", borderRadius:2 }}><div style={{ height:"100%", width:`${c.progress}%`, background:"#22c55e", borderRadius:2 }}/></div>
                    </div>
                    <div style={{ padding:"0 16px", display:"flex", gap:8 }}>
                      <button onClick={()=>handleManage(c.id)} style={{ padding:"7px 18px", background:"white", border:"1.5px solid #22c55e", borderRadius:7, fontSize:12, fontWeight:700, color:"#22c55e", cursor:"pointer" }}
                        onMouseOver={e=>{(e.currentTarget as HTMLElement).style.background="#22c55e";(e.currentTarget as HTMLElement).style.color="white"}}
                        onMouseOut={e=>{(e.currentTarget as HTMLElement).style.background="white";(e.currentTarget as HTMLElement).style.color="#22c55e"}}>MANAGE</button>
                      <button onClick={()=>handleDelete(c.id)} style={{ padding:"7px 14px", background:"white", border:"1.5px solid #ef4444", borderRadius:7, fontSize:12, fontWeight:700, color:"#ef4444", cursor:"pointer" }}
                        onMouseOver={e=>{(e.currentTarget as HTMLElement).style.background="#fef2f2"}}
                        onMouseOut={e=>{(e.currentTarget as HTMLElement).style.background="white"}}>DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}