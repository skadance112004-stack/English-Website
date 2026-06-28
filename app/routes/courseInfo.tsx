import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { createCourse, updateCourse, updateCourseThumbnailWithUpload, type Course } from "../models/courseModel";
import { getTeacherProfile } from "../models/teacherModel";



export default function CourseInfo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = user?.displayName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "T";
  const avatarUrl = user?.photoURL || "";

  const existingData = location.state || {};
  const [courseId, setCourseId] = useState<string>(existingData.courseId || "");
  const [teacherProfile, setTeacherProfile] = useState<any>(null);

  const [form, setForm] = useState({
    title: existingData.title || "",
    subtitle: existingData.subtitle || "",
    description: existingData.description || "",
    level: existingData.level || "",
    category: existingData.category || "",
    duration: existingData.duration || "",
    price: existingData.price || "",
  });
  const [achievements, setAchievements] = useState<string[]>(existingData.achievements || [""]);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>(existingData.thumbnail || "");
  const [thumbnailPreview, setThumbnailPreview] = useState<string>(existingData.thumbnail || "");
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPublished, setIsPublished] = useState<boolean>(existingData.published || false);

  useEffect(() => {
    if (courseId && !form.title) {
      async function fetchCourse() {
        const { getCourse } = await import("../models/courseModel");
        const data = await getCourse(courseId);
        if (data) {
          setForm({
            title: data.title || "",
            subtitle: data.subtitle || "",
            description: data.description || "",
            level: data.level || "",
            category: data.category || "",
            duration: data.totalDuration?.toString() || "",
            price: data.price?.toString() || "",
          });
          setAchievements(data.whatYouLearn || [""]);
          setThumbnailUrl(data.thumbnail || "");
          setThumbnailPreview(data.thumbnail || "");
          setIsPublished(data.published || false);
        }
      }
      fetchCourse();
    }
  }, [courseId]);

  useEffect(() => {
    if (thumbnail) {
      const url = URL.createObjectURL(thumbnail);
      setThumbnailPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [thumbnail]);

  useEffect(() => {
    async function fetchProfile() {
      if (user?.uid) {
        const profile = await getTeacherProfile(user.uid);
        setTeacherProfile(profile);
      }
    }
    fetchProfile();
  }, [user?.uid]);

  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const categories = [
    "General English", "Business English", "IELTS", "TOEIC",
    "Academic", "Grammar", "Vocabulary", "Speaking",
    "Listening", "Reading", "Writing", "Kids",
  ];

  const handleFile = (file: File) => {
    if (!file.type.match(/image\/(png|jpeg|gif)/)) return;
    setThumbnail(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleAchievementChange = (i: number, value: string) => {
    const updated = [...achievements];
    updated[i] = value;
    setAchievements(updated);
  };

  const addAchievement = () => setAchievements([...achievements, ""]);

  const removeAchievement = (i: number) => {
    if (achievements.length === 1) return;
    setAchievements(achievements.filter((_, idx) => idx !== i));
  };

  const getCourseData = (isPublishing = false) => {
    const sections = existingData.sections || [];
    const totalLessons = sections.reduce((acc: number, s: any) => acc + (s.items?.filter((i: any) => i.kind === "lesson").length || 0), 0);
    const totalExercises = sections.reduce((acc: number, s: any) => acc + (s.items?.filter((i: any) => i.kind === "exercise").length || 0), 0);

    // Extract first five lesson IDs
    const firstFive = sections
      .flatMap((s: any) => s.items || [])
      .filter((i: any) => i.kind === "lesson")
      .slice(0, 5)
      .map((i: any) => i.id);

    return {
      title: form.title || "Untitled Course",
      subtitle: form.subtitle,
      description: form.description,
      instructor: {
        id: user?.uid || "",
        name: user?.displayName || teacherProfile?.name || "Unknown Instructor",
        avatar: user?.photoURL || teacherProfile?.avatar || "",
        experience: teacherProfile?.teacherProfile?.experience || "",
      },
      thumbnail: thumbnailUrl,
      price: parseFloat(form.price) || 0,
      level: form.level || "A1",
      category: form.category || "General English",
      rating: existingData.rating || 0,
      studentCompleted: existingData.studentCompleted || 0,
      totalRatings: existingData.totalRatings || 0,
      totalStudents: existingData.totalStudents || 0,
      totalLessons,
      totalExercises,
      totalExams: existingData.totalExams || 0,
      totalDuration: parseFloat(form.duration) || 0,
      tags: form.category ? [form.category] : [],
      whatYouLearn: achievements.filter(Boolean),
      firstFiveLessons: firstFive,
      published: isPublishing || isPublished,
      createdBy: user?.uid || "",
      aiAssisted: false,
      sections,
      draftStatus: {
        lastEditedAt: new Date(),
      }
    };
  };

  const handleSaveDraft = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const courseData = getCourseData(false);
      let currentCourseId = courseId;

      if (currentCourseId) {
        await updateCourse(currentCourseId, courseData);
      } else {
        const newCourse = await createCourse(courseData);
        currentCourseId = newCourse.courseId;
        setCourseId(currentCourseId);
      }

      if (thumbnail) {
        const newThumbnailUrl = await updateCourseThumbnailWithUpload(user.uid, currentCourseId, thumbnail);
        setThumbnailUrl(newThumbnailUrl);
        setThumbnail(null);
      }
    } catch (error) {
      console.error("Error saving draft:", error);
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
      } else {
        const newCourse = await createCourse(courseData);
        currentCourseId = newCourse.courseId;
        setCourseId(currentCourseId);
      }

      if (thumbnail) {
        const newThumbnailUrl = await updateCourseThumbnailWithUpload(user.uid, currentCourseId, thumbnail);
        setThumbnailUrl(newThumbnailUrl);
        setThumbnail(null);
      }
      
      // Optionally navigate back to management or show success
      navigate("/courses");
    } catch (error) {
      console.error("Error publishing course:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    await goToLessons();
  };

  const goToLessons = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const courseData = getCourseData();
      let currentCourseId = courseId;

      if (currentCourseId) {
        await updateCourse(currentCourseId, courseData);
      } else {
        const newCourse = await createCourse(courseData);
        currentCourseId = newCourse.courseId;
        setCourseId(currentCourseId);
      }

      let finalThumbnailUrl = thumbnailUrl;
      if (thumbnail) {
        finalThumbnailUrl = await updateCourseThumbnailWithUpload(user.uid, currentCourseId, thumbnail);
        setThumbnailUrl(finalThumbnailUrl);
        setThumbnail(null);
      }

      navigate("/courses/create/lessons", {
        state: {
          ...existingData,
          ...form,
          courseId: currentCourseId,
          achievements: achievements.filter(Boolean),
          thumbnail: finalThumbnailUrl,
          sections: existingData.sections || [],
        },
      });
    } catch (error) {
      console.error("Error saving draft before navigation:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input, textarea, select { font-family: 'DM Sans', sans-serif; }
        input::placeholder, textarea::placeholder { color: #c0c4cc; }
        .field-input:focus { outline: none; border-color: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.12); }
        .field-input { transition: border-color 0.15s, box-shadow 0.15s; }
        .nav-tab { transition: color 0.15s; }
        .btn-draft:hover { background: #e5e7eb !important; }
        .btn-continue:hover { background: #16a34a !important; }
        .add-btn:hover { color: #16a34a !important; }
        .remove-btn:hover { color: #ef4444 !important; }
      `}</style>

      

      {/* ── Navbar ── */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 13, fontWeight: 500 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Tab pills */}
        <div style={{ display: "flex", gap: 0, background: "#f3f4f6", borderRadius: 24, padding: "3px", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <div style={{ padding: "6px 20px", background: "#22c55e", color: "white", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "default" }}>
            Course info
          </div>
          <button 
            type="button"
            onClick={goToLessons}
            className="nav-tab" 
            style={{ padding: "6px 20px", color: "#9ca3af", borderRadius: 20, fontSize: 13, fontWeight: 500, border: "none", background: "transparent", cursor: "pointer" }}
          >
            Lessons
          </button>
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#22c55e", fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            All changes saved
          </div>
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

      {/* ── Form body ── */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 100px" }}>
        <form onSubmit={handleContinue}>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 6 }}>Course Information</h1>
            <p style={{ fontSize: 13, color: "#9ca3af" }}>Fill in the details about your new course.</p>
          </div>

          {/* Course Title */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>
              Course Title <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Advanced Business English"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="field-input"
              style={inputStyle}
            />
          </div>

          {/* Subtitle */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Subtitle</label>
            <input
              type="text"
              placeholder=""
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className="field-input"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              rows={4}
              placeholder="What will students learn in this course?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="field-input"
              style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }}
            />
          </div>

          {/* Thumbnail upload */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Course Thumbnail</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? "#22c55e" : "#d1d5db"}`,
                borderRadius: 10,
                background: isDragging ? "#f0fdf4" : "#fafafa",
                padding: "32px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
                minHeight: 120,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {thumbnailPreview ? (
                <>
                  <img src={thumbnailPreview} alt="thumbnail" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
                    <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Click to change</span>
                  </div>
                </>
              ) : (
                <>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 2 }}>
                    <span style={{ color: "#22c55e", fontWeight: 600 }}>Upload a file</span>
                    <span> or drag and drop</span>
                  </p>
                  <p style={{ fontSize: 11, color: "#9ca3af" }}>PNG, JPG, GIF up to 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          </div>

          {/* Level + Category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Level</label>
              <div style={{ position: "relative" }}>
                <select
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                  className="field-input"
                  style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}
                >
                  <option value="">Select Level</option>
                  {levels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <div style={{ position: "relative" }}>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="field-input"
                  style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Duration + Price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>Duration (Hours)</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 24"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="field-input"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Price (USD)</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 13 }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="field-input"
                  style={{ ...inputStyle, paddingLeft: 28 }}
                />
              </div>
            </div>
          </div>

          {/* What can you achieve */}
          <div style={{ marginBottom: 32 }}>
            <label style={labelStyle}>What can you achieve?</label>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
              List the key outcomes students will gain from this course.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {achievements.map((val, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="e.g. Write professional emails with confidence"
                    value={val}
                    onChange={(e) => handleAchievementChange(i, e.target.value)}
                    className="field-input"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {achievements.length > 1 && (
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeAchievement(i)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 4, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="add-btn"
              onClick={addAchievement}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, background: "none", border: "none", cursor: "pointer", color: "#22c55e", fontSize: 13, fontWeight: 600, padding: 0, transition: "color 0.15s" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add another achievement
            </button>
          </div>

          {/* Bottom action bar */}
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "14px 32px", display: "flex", justifyContent: "flex-end", gap: 12, zIndex: 50 }}>
            <button
              type="button"
              className="btn-draft"
              onClick={handleSaveDraft}
              disabled={saving}
              style={{ padding: "10px 24px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
            >
              {saving ? "Saving..." : "Save as Draft"}
            </button>
            <button
              type="button"
              className="btn-draft"
              onClick={handlePublish}
              disabled={saving}
              style={{ padding: "10px 24px", background: "#f3f4f6", color: "#22c55e", border: "1px solid #22c55e", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
            >
              {saving ? "Publishing..." : "Publish Course"}
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="btn-continue"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", background: "#22c55e", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
            >
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 13,
  color: "#111",
  background: "white",
};