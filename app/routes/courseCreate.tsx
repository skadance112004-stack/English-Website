import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { createCourse, updateCourse, saveSection, updateSections, getSections, type Section, type SectionItem, type LessonType, type ExerciseType, type LessonItem, type ExerciseItem } from "../models/courseModel";



// ─── Helpers ─────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const LESSON_COLORS: Record<LessonType, { bg: string; text: string }> = {
  Reading:    { bg: "#dbeafe", text: "#2563eb" },
  Listening:  { bg: "#fef9c3", text: "#d97706" },
  Speaking:   { bg: "#fce7f3", text: "#db2777" },
  Writing:    { bg: "#e0e7ff", text: "#7c3aed" },
  Grammar:    { bg: "#d1fae5", text: "#059669" },
  Vocabulary: { bg: "#ffedd5", text: "#ea580c" },
  General:    { bg: "#f3f4f6", text: "#6b7280" },
};

const EXERCISE_COLORS: Record<ExerciseType, { bg: string; text: string }> = {
  Quiz:      { bg: "#fef3c7", text: "#d97706" },
  Speaking:  { bg: "#fce7f3", text: "#db2777" },
  Listening: { bg: "#fef9c3", text: "#d97706" },
  Reading:   { bg: "#dbeafe", text: "#2563eb" },
};

const lessonIcon = (type: LessonType) => {
  const color = LESSON_COLORS[type]?.text || "#6b7280";
  switch (type) {
    case "Listening": return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
      </svg>
    );
    case "Speaking": return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    );
    default: return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    );
  }
};

const exerciseIcon = (type: ExerciseType) => {
  const color = EXERCISE_COLORS[type]?.text || "#d97706";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
};

const formatDuration = (mins: number) =>
  mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} mins`;

const totalDuration = (sections: Section[]) => {
  let total = 0;
  sections.forEach(s => {
    (s.items || []).forEach(i => { total += i.duration; });
  });
  return formatDuration(total);
};

const totalLessons = (sections: Section[]) =>
  sections.reduce((acc, s) => acc + (s.items?.filter(i => i.kind === "lesson").length || 0), 0);

// ─── Modal ────────────────────────────────────────────────────────────────────

interface AddItemModalProps {
  type: "lesson" | "exercise";
  onClose: () => void;
  onAdd: (item: Omit<LessonItem, "id" | "kind" | "number"> | Omit<ExerciseItem, "id" | "kind" | "number">) => void;
}

function AddItemModal({ type, onClose, onAdd }: AddItemModalProps) {
  const [form, setForm] = useState({
    title: "",
    type: type === "lesson" ? "Reading" : "Quiz",
    duration: 30,
    exerciseCount: 0,
    questionCount: 5,
    audioCount: 0,
  });

  const lessonTypes: LessonType[] = ["Reading", "Listening", "Speaking", "Writing", "Grammar", "Vocabulary", "General"];
  const exerciseTypes: ExerciseType[] = ["Quiz", "Speaking", "Listening", "Reading"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "lesson") {
      onAdd({ title: form.title, type: form.type as LessonType, duration: form.duration, exerciseCount: form.exerciseCount, audioCount: form.audioCount });
    } else {
      onAdd({ title: form.title, type: form.type as ExerciseType, duration: form.duration, questionCount: form.questionCount });
    }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 16, padding: 28, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 20 }}>
          Add {type === "lesson" ? "Lesson" : "Exercise"}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={modalLabel}>Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={type === "lesson" ? "e.g. Email Etiquette Basics" : "e.g. Comprehension Quiz"} style={modalInput} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={modalLabel}>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={modalInput}>
                {(type === "lesson" ? lessonTypes : exerciseTypes).map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={modalLabel}>Duration (mins)</label>
              <input type="number" min={1} value={form.duration} onChange={e => setForm({ ...form, duration: +e.target.value })} style={modalInput} />
            </div>
          </div>
          {type === "lesson" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={modalLabel}>Exercises</label>
                <input type="number" min={0} value={form.exerciseCount} onChange={e => setForm({ ...form, exerciseCount: +e.target.value })} style={modalInput} />
              </div>
              <div>
                <label style={modalLabel}>Audio files</label>
                <input type="number" min={0} value={form.audioCount} onChange={e => setForm({ ...form, audioCount: +e.target.value })} style={modalInput} />
              </div>
            </div>
          )}
          {type === "exercise" && (
            <div>
              <label style={modalLabel}>Questions</label>
              <input type="number" min={1} value={form.questionCount} onChange={e => setForm({ ...form, questionCount: +e.target.value })} style={modalInput} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: "10px", background: "#22c55e", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}>Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalLabel: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 };
const modalInput: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#111", background: "white", boxSizing: "border-box" };

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CourseLessons() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const courseInfo = location.state || {};

  const initials = user?.displayName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "T";
  const avatarUrl = user?.photoURL || "";

  const [courseId, setCourseId] = useState<string>(courseInfo.courseId || "");
  const [sections, setSections] = useState<Section[]>(courseInfo.sections || [
    { id: uid(), title: "Section  1:", expanded: true, items: [] },
  ]);
  const [sortBy, setSortBy] = useState("Date Created");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [modal, setModal] = useState<{ type: "lesson" | "exercise"; sectionId: string } | null>(null);
  const [dragItem, setDragItem] = useState<{ sectionId: string; itemId: string } | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) {
      const fetchSections = async () => {
        try {
          const data = await getSections(courseId);
          if (data && data.length > 0) {
            setSections(data.map(s => ({ ...s, expanded: true, items: s.items || [] })));
          }
        } catch (error) {
          console.error("Error fetching sections:", error);
        }
      };
      fetchSections();
    }
  }, [courseId]);

  // ── Section actions ──────────────────────────────────────────────────────────

  const addSection = async () => {
    const newSection: Section = {
      id: uid(),
      title: `Section  ${sections.length + 1}:`,
      expanded: true,
      items: [],
    };
    
    const updatedSections = [...sections, newSection];
    setSections(updatedSections);

    if (courseId) {
      try {
        await saveSection(courseId, newSection, updatedSections.length);
      } catch (error) {
        console.error("Error saving section:", error);
      }
    }
  };

  const toggleSection = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));
  };

  const updateSectionTitle = (id: string, title: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  };

  // ── Item actions ─────────────────────────────────────────────────────────────

  const getCourseData = (isPublishing = false) => {
    const totalLessonsCount = totalLessons(sections);
    const totalExercisesCount = sections.reduce((acc, s) => acc + (s.items?.filter(i => i.kind === "exercise").length || 0), 0);

    // Extract first five lesson IDs
    const firstFive = sections
      .flatMap(s => s.items || [])
      .filter(i => i.kind === "lesson")
      .slice(0, 5)
      .map(i => i.id);

    return {
      title: courseInfo.title || "Untitled Course",
      subtitle: courseInfo.subtitle || "",
      description: courseInfo.description || "",
      instructor: courseInfo.instructor || {
        id: user?.uid || "",
        name: user?.displayName || "Unknown Instructor",
        avatar: user?.photoURL || "",
        experience: "",
      },
      thumbnail: courseInfo.thumbnail || "",
      price: parseFloat(courseInfo.price?.toString()) || 0,
      level: courseInfo.level || "A1",
      category: courseInfo.category || "General English",
      rating: courseInfo.rating || 0,
      studentCompleted: courseInfo.studentCompleted || 0,
      totalRatings: courseInfo.totalRatings || 0,
      totalStudents: courseInfo.totalStudents || 0,
      totalLessons: totalLessonsCount,
      totalExercises: totalExercisesCount,
      totalExams: courseInfo.totalExams || 0,
      totalDuration: parseFloat(courseInfo.duration?.toString()) || 0,
      tags: courseInfo.category ? [courseInfo.category] : [],
      whatYouLearn: courseInfo.achievements || [],
      firstFiveLessons: firstFive,
      published: isPublishing || (courseInfo.published === true),
      createdBy: user?.uid || "",
      aiAssisted: false,
      sections,
      draftStatus: {
        lastEditedAt: new Date(),
      }
    };
  };

  const handleSaveDraft = async () => {
    if (!user) return courseId;
    setSaving(true);
    try {
      const courseData = getCourseData(false);
      let currentCourseId = courseId;

      if (currentCourseId) {
        await updateCourse(currentCourseId, courseData);
        await updateSections(currentCourseId, sections);
      } else {
        const newCourse = await createCourse(courseData);
        currentCourseId = newCourse.courseId;
        setCourseId(currentCourseId);
        await updateSections(currentCourseId, sections);
      }
      return currentCourseId;
    } catch (error) {
      console.error("Error saving draft:", error);
      return courseId;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const courseData = getCourseData(true);
      let currentCourseId = courseId;

      if (currentCourseId) {
        await updateCourse(currentCourseId, courseData);
        await updateSections(currentCourseId, sections);
      } else {
        const newCourse = await createCourse(courseData);
        currentCourseId = newCourse.courseId;
        setCourseId(currentCourseId);
        await updateSections(currentCourseId, sections);
      }
      
      navigate("/courses");
    } catch (error) {
      console.error("Error publishing course:", error);
    } finally {
      setSaving(false);
    }
  };

  const goToLesson = async (sectionId: string, lessonId: string) => {
    const currentCid = await handleSaveDraft();
    const finalCid = currentCid || courseId;
    
    if (!finalCid) return;

    const targetSection = sections.find(s => s.id === sectionId);
    const existingItem = targetSection?.items?.find(i => i.id === lessonId);
    const order = existingItem && targetSection?.items 
      ? targetSection.items.indexOf(existingItem) + 1 
      : (targetSection?.items?.length || 0) + 1;

    navigate(`/courses/create/lessons/${lessonId}/edit`, { 
      state: { 
        sectionId,
        order,
        courseId: finalCid,
        courseInfo: { ...getCourseData(), courseId: finalCid } 
      } 
    });
  };

  const goToExercise = async (sectionId: string, exerciseId: string, specificType?: string) => {
    const currentCid = await handleSaveDraft();
    const finalCid = currentCid || courseId;
    
    if (!finalCid) return;

    const targetSection = sections.find(s => s.id === sectionId);
    const existingItem = targetSection?.items?.find(i => i.id === exerciseId);
    const order = existingItem && targetSection?.items 
      ? targetSection.items.indexOf(existingItem) + 1 
      : (targetSection?.items?.length || 0) + 1;

    const path = specificType === "Speaking" 
      ? `/courses/create/speaking/${exerciseId}/edit` 
      : `/courses/create/exercises/${exerciseId}/edit`;

    navigate(path, { 
      state: { 
        sectionId,
        order,
        courseId: finalCid,
        courseInfo: { ...getCourseData(), courseId: finalCid },
        initialType: specificType
      } 
    });
  };

  const addItem = async (sectionId: string, type: "lesson" | "exercise", specificType?: string) => {
    if (type === "lesson") {
      await goToLesson(sectionId, uid());
    } else {
      await goToExercise(sectionId, uid(), specificType);
    }
  };

  const handleModalAdd = (data: any) => {
    if (!modal) return;
    setSections(prev => prev.map(s => {
      if (s.id !== modal.sectionId) return s;
      const newItem: SectionItem = modal.type === "lesson"
        ? { id: uid(), kind: "lesson", number: s.items.length + 1, ...data }
        : { id: uid(), kind: "exercise", number: s.items.length + 1, ...data };
      return { ...s, items: [...s.items, newItem] };
    }));
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const handleDragStart = (sectionId: string, itemId: string) => {
    setDragItem({ sectionId, itemId });
  };

  const handleDropOnSection = (targetSectionId: string) => {
    if (!dragItem || dragItem.sectionId === targetSectionId) return;
    setSections(prev => {
      const sourceSection = prev.find(s => s.id === dragItem.sectionId)!;
      const item = sourceSection.items.find(i => i.id === dragItem.itemId)!;
      return prev.map(s => {
        if (s.id === dragItem.sectionId) return { ...s, items: s.items.filter(i => i.id !== dragItem.itemId) };
        if (s.id === targetSectionId) return { ...s, items: [...s.items, item] };
        return s;
      });
    });
    setDragItem(null);
    setDragOverSection(null);
  };

  // ── Stats ────────────────────────────────────────────────────────────────────

  const lessonCount = totalLessons(sections);
  const duration = totalDuration(sections);

  const sectionStats = (s: Section) => {
    const items = s.items || [];
    const lessons = items.filter(i => i.kind === "lesson").length;
    const exercises = items.filter(i => i.kind === "exercise").length;
    const mins = items.reduce((acc, i) => acc + i.duration, 0);
    return `${lessons} lesson${lessons !== 1 ? "s" : ""}, ${exercises} exercise${exercises !== 1 ? "s" : ""} • ${formatDuration(mins)}`;
  };

  const goToCourseInfo = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const courseData = getCourseData();
      let currentCourseId = courseId;

      if (currentCourseId) {
        await updateCourse(currentCourseId, courseData);
        await updateSections(currentCourseId, sections);
      } else {
        const newCourse = await createCourse(courseData);
        currentCourseId = newCourse.courseId;
        setCourseId(currentCourseId);
        await updateSections(currentCourseId, sections);
      }

      navigate("/courses/create", { 
        state: { 
          ...courseInfo, 
          sections, 
          courseId: currentCourseId 
        } 
      });
    } catch (error) {
      console.error("Error saving draft before navigation:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        .drag-handle { opacity: 0; transition: opacity 0.15s; cursor: grab; }
        .lesson-row:hover .drag-handle { opacity: 1; }
        .add-btn:hover { opacity: 0.75; }
        .section-item:hover { background: #f9fafb !important; }
        .sort-select:focus { outline: none; }
        input, select, textarea { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'DM Sans', sans-serif" }}>

        
        {/* ── Navbar ── */}
        <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
          <button onClick={() => navigate("/dashboard")} style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 24, padding: "3px", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
            <button onClick={goToCourseInfo} style={{ padding: "6px 20px", background: "transparent", color: "#9ca3af", borderRadius: 20, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer" }}>
              Course info
            </button>
            <div style={{ padding: "6px 20px", background: "#22c55e", color: "white", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              Lessons
            </div>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#22c55e", fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              All changes saved
            </span>
            <button style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "#e5e7eb", flexShrink: 0 }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700 }}>{initials}</div>}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px 120px" }}>

          {/* Back link */}
          <button onClick={() => navigate(-1)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Go Back
          </button>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>Course Lessons</h1>
              <p style={{ fontSize: 13, color: "#9ca3af" }}>
                {lessonCount} lesson{lessonCount !== 1 ? "s" : ""} added • Total duration {duration}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Sort */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", background: "white", fontSize: 13, color: "#374151" }}>
                <span>Sort by {sortBy}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {/* View toggle */}
              <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "white" }}>
                {(["list", "grid"] as const).map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "7px 10px", border: "none", background: viewMode === mode ? "#f3f4f6" : "white", cursor: "pointer", display: "flex", alignItems: "center" }}>
                    {mode === "list"
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={viewMode === "list" ? "#111" : "#9ca3af"} strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={viewMode === "grid" ? "#111" : "#9ca3af"} strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sections ── */}
          {sections.map((section) => (
            <div key={section.id} style={{ marginBottom: 16 }}
              onDragOver={e => { e.preventDefault(); setDragOverSection(section.id); }}
              onDrop={() => handleDropOnSection(section.id)}
            >
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0", borderBottom: section.expanded ? "1px solid #e5e7eb" : "none" }}>
                {/* Drag dots */}
                <div style={{ cursor: "grab", color: "#d1d5db", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  {editingSectionId === section.id ? (
                    <input
                      autoFocus
                      value={section.title}
                      onChange={e => updateSectionTitle(section.id, e.target.value)}
                      onBlur={() => setEditingSectionId(null)}
                      onKeyDown={e => e.key === "Enter" && setEditingSectionId(null)}
                      style={{ fontSize: 15, fontWeight: 700, color: "#111", border: "none", borderBottom: "2px solid #22c55e", outline: "none", background: "transparent", width: "100%" }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingSectionId(section.id)}
                      style={{ fontSize: 15, fontWeight: 700, color: "#111", cursor: "text" }}
                    >
                      {section.title}
                    </span>
                  )}
                  <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sectionStats(section)}</p>
                </div>
                <button onClick={() => toggleSection(section.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {section.expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                  </svg>
                </button>
              </div>

              {/* Section items */}
              {section.expanded && (
                <div style={{ paddingTop: 8 }}>
                  {section.items.map((item, idx) => (
                    <div key={item.id}>
                      {/* Drop zone between items */}
                      {dragItem && dragItem.sectionId === section.id && (
                        <div style={{ height: 4, margin: "4px 0", borderRadius: 4, background: dragOverSection === section.id ? "#bbf7d0" : "transparent", border: dragOverSection === section.id ? "2px dashed #22c55e" : "2px dashed transparent", transition: "all 0.15s" }} />
                      )}

                      {/* Lesson row */}
                      {item.kind === "lesson" && (() => {
                        const lesson = item as LessonItem;
                        const colors = LESSON_COLORS[lesson.type] || LESSON_COLORS.General;
                        return (
                          <div className="lesson-row section-item" 
                            draggable 
                            onDragStart={() => handleDragStart(section.id, item.id)}
                            onClick={() => goToLesson(section.id, item.id)}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 10, marginBottom: 4, background: "white", cursor: "pointer", transition: "background 0.15s" }}>
                            <div className="drag-handle" style={{ color: "#d1d5db" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                            </div>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {lessonIcon(lesson.type)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>
                                <span style={{ color: "#22c55e", fontWeight: 600 }}>Lesson {idx + 1}</span>
                                {"  "}{lesson.title}
                              </p>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, background: colors.bg, color: colors.text, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                  {lesson.type}
                                </span>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatDuration(lesson.duration)}</span>
                                {lesson.exerciseCount > 0 && <><span style={{ fontSize: 12, color: "#d1d5db" }}>•</span><span style={{ fontSize: 12, color: "#9ca3af" }}>{lesson.exerciseCount} Exercise{lesson.exerciseCount !== 1 ? "s" : ""}</span></>}
                                {(lesson.audioCount || 0) > 0 && <><span style={{ fontSize: 12, color: "#d1d5db" }}>•</span><span style={{ fontSize: 12, color: "#9ca3af" }}>{lesson.audioCount} Audio</span></>}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Exercise row */}
                      {item.kind === "exercise" && (() => {
                        const exercise = item as ExerciseItem;
                        const colors = EXERCISE_COLORS[exercise.type] || EXERCISE_COLORS.Quiz;
                        return (
                          <div className="lesson-row section-item" 
                            draggable 
                            onDragStart={() => handleDragStart(section.id, item.id)}
                            onClick={() => goToExercise(section.id, item.id, exercise.type)}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 10, marginBottom: 4, background: "#fffdf5", border: "1px solid #fef3c7", cursor: "pointer", transition: "background 0.15s" }}>
                            <div className="drag-handle" style={{ color: "#d1d5db" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                            </div>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {exerciseIcon(exercise.type)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>
                                <span style={{ color: "#d97706", fontWeight: 600 }}>Exercise {idx + 1}</span>
                                {"  "}{exercise.title}
                              </p>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, background: colors.bg, color: colors.text, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                  {exercise.type}
                                </span>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatDuration(exercise.duration)}</span>
                                <span style={{ fontSize: 12, color: "#d1d5db" }}>•</span>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{exercise.questionCount} questions</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}

                  {/* Drop zone hint */}
                  {dragItem && dragItem.sectionId !== section.id && (
                    <div style={{ height: 40, margin: "8px 0", borderRadius: 8, border: "2px dashed #bbf7d0", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 500 }}>• Drop here to reorder •</span>
                    </div>
                  )}

                  {/* Add buttons */}
                  <div style={{ display: "flex", gap: 20, padding: "14px 10px 8px" }}>
                    <button className="add-btn" onClick={() => addItem(section.id, "lesson")} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#22c55e", transition: "opacity 0.15s" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Lesson
                    </button>
                    <button className="add-btn" onClick={() => addItem(section.id, "exercise", "Quiz")} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#3b82f6", transition: "opacity 0.15s" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Exercise
                    </button>
                    <button className="add-btn" onClick={() => addItem(section.id, "exercise", "Speaking")} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#f59e0b", transition: "opacity 0.15s" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Speaking
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add New Section */}
          <button
            onClick={addSection}
            style={{ width: "100%", padding: "16px", border: "2px dashed #e5e7eb", borderRadius: 12, background: "white", fontSize: 14, fontWeight: 600, color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, transition: "border-color 0.15s, color 0.15s" }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#22c55e"; (e.currentTarget as HTMLButtonElement).style.color = "#22c55e"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add New Section
          </button>
        </div>

        {/* ── Bottom bar ── */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "14px 32px", display: "flex", justifyContent: "flex-end", gap: 12, zIndex: 50 }}>
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            style={{ padding: "10px 24px", background: "white", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer" }}
          >
            {saving ? "Saving..." : "Save as Draft"}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving}
            style={{ padding: "10px 24px", background: "white", border: "1px solid #22c55e", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "#22c55e", cursor: "pointer" }}
          >
            {saving ? "Publishing..." : "Publish Course"}
          </button>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <AddItemModal
          type={modal.type}
          onClose={() => setModal(null)}
          onAdd={handleModalAdd}
        />
      )}
    </>
  );
}
