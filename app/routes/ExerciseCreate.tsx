import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router";
import {
  doc, collection, setDoc, addDoc, updateDoc,
  serverTimestamp, getDoc, getDocs, writeBatch, query, orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase/firebase";
import { useAuth } from "../auth/AuthContext";
import {
  generateExerciseContent,
  markExerciseLogAccepted,
  summarizeQuestions,
  type AIQuestion,
  type AIPassage,
  type AIAudioContent,
} from "../service/geminiExerciseService";
// ─── Types ─────────────────────────────────────────────────────────────────────
type ExerciseType = "Reading" | "Listening" | "Speaking" | "Quiz";
type QuestionType = "MCQ" | "T-F-NG" | "SHORT ANSWER";

interface Option {
  optionId: string;
  text: string;
  isCorrect: boolean;
}

interface Question {
  questionId:      string;  // local uid; becomes Firestore doc id
  questionType:    QuestionType;
  order:           number;
  questionText:    string;
  options:         Option[];
  acceptedAnswers: string[];
  explanation:     string;
  hint:            string;
  points:          number;
  aiGenerated:     boolean;
  _status:         "active" | "editing";  // UI only
}

interface ExerciseMeta {
  title:       string;
  description: string;
  type:        ExerciseType;
  metadata: {
    questionCount: number;
    duration:      number;
    xpReward:      number;
    pointsReward:  number;
    passingScore:  number;
  };
  order:       number;
  aiGenerated: boolean;
}

interface ReadingContent {
  title: string;
  wordcount: number;
  thumbnail: string;
  text: string;
}

interface AudioContent {
  url:        string;
  duration:   number;
  title:      string;
  difficulty: string;
  topic:      string;
  accent:     string;
  transcript: { full: string; timestamped: any[] };
}

const uid = () => Math.random().toString(36).slice(2, 9);
const mkOption = (id: string): Option => ({ optionId: id, text: "", isCorrect: false });

const mkQuestion = (order: number): Question => ({
  questionId:      uid(),
  questionType:    "MCQ",
  order,
  questionText:    "",
  options:         [mkOption("A"), mkOption("B"), mkOption("C"), mkOption("D")],
  acceptedAnswers: [],
  explanation:     "",
  hint:            "",
  points:          1,
  aiGenerated:     false,
  _status:         "editing",
});

// ─── Shared style constants ────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px", border: "1px solid #e5e7eb",
  borderRadius: 7, fontSize: 13, color: "#111", background: "white", outline: "none",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5,
};

// ─── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({
  meta, setMeta,
  readingContent, setReadingContent,
  audioContent,   setAudioContent,
  setAudioFileObj,
}: {
  meta: ExerciseMeta; setMeta: (m: ExerciseMeta) => void;
  readingContent: ReadingContent; setReadingContent: (r: ReadingContent) => void;
  audioContent:   AudioContent;  setAudioContent:   (a: AudioContent)   => void;
  setAudioFileObj: (f: File) => void;
}) {
  const docRef  = useRef<HTMLInputElement>(null);
  const audRef  = useRef<HTMLInputElement>(null);
  const [docFile,  setDocFile]  = useState<File|null>(null);
  const [audFile,  setAudFile]  = useState<File|null>(null);
  const [dragging, setDragging] = useState<"doc"|"aud"|null>(null);
  
  const isReading   = meta.type === "Reading";
  const isListening = meta.type === "Listening";

  const handleDocFile = (file: File) => {
    setDocFile(file);
    // Parse text if txt/md, otherwise just store filename
    if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      const reader = new FileReader();
      reader.onload = e => {
        const text = (e.target?.result as string) || "";
        const wordcount = text.split(/\s+/).filter(Boolean).length;
        setReadingContent({ ...readingContent, title: file.name.replace(/\.[^.]+$/, ""), text, wordcount });
      };
      reader.readAsText(file);
    } else {
      setReadingContent({ ...readingContent, title: file.name.replace(/\.[^.]+$/, "") });
    }
  };

  const handleAudFile = (file: File) => {
    setAudFile(file);
    setAudioFileObj(file);
    const url = URL.createObjectURL(file);
    setAudioContent({ ...audioContent, url, title: file.name.replace(/\.[^.]+$/, "") });
  };

  const sec: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#9ca3af",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, marginTop: 18,
  };
  const hr: React.CSSProperties = { height: 1, background: "#f3f4f6", margin: "14px 0" };

  return (
    <div style={{ padding: "14px 16px 40px", fontSize: 13 }}>
      {/* Exercise Type */}
      <div style={sec}>Exercise Type</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
        {(["Reading","Listening","Speaking","Quiz"] as ExerciseType[]).map(t => (
          <button key={t} onClick={() => setMeta({ ...meta, type: t })}
            style={{ flex: "1 1 calc(50% - 3px)", padding: "8px 0", border: `1.5px solid ${meta.type===t?"#22c55e":"#e5e7eb"}`, borderRadius: 8, background: meta.type===t?"#f0fdf4":"white", fontSize: 12, fontWeight: 600, color: meta.type===t?"#22c55e":"#6b7280", cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={hr}/>

      {/* Basic Info */}
      <div style={sec}>Basic Info</div>
      <label style={lbl}>Title</label>
      <input style={{ ...inp, marginBottom: 10 }} value={meta.title}
        onChange={e => setMeta({ ...meta, title: e.target.value })} placeholder="e.g. Reading Comprehension Quiz"/>
      <label style={lbl}>Description</label>
      <textarea rows={2} style={{ ...inp, resize:"none", lineHeight:1.6, marginBottom: 0 }} value={meta.description}
        onChange={e => setMeta({ ...meta, description: e.target.value })} placeholder="Brief description..."/>

      <div style={hr}/>

      {/* Scoring */}
      <div style={sec}>Scoring & Rewards</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
        {[
          { label:"XP Reward",      key:"xpReward"      as const, min:0  },
          { label:"Points Reward",  key:"pointsReward"  as const, min:0  },
          { label:"Passing Score %",key:"passingScore"  as const, min:0, max:100 },
          { label:"Duration (min)", key:"duration"      as const, min:0  },
        ].map(f => (
          <div key={f.key}>
            <label style={lbl}>{f.label}</label>
            <input type="number" min={f.min} max={f.max} style={inp}
              value={meta.metadata[f.key]}
              onChange={e => setMeta({ ...meta, metadata: { ...meta.metadata, [f.key]: +e.target.value }})}/>
          </div>
        ))}
      </div>

      <div style={hr}/>

      {/* Material Upload — Reading */}
      {isReading && (
        <>
          <div style={sec}>Reading Material</div>
          {/* Upload zone */}
          <div
            onDragOver={e=>{ e.preventDefault(); setDragging("doc"); }}
            onDragLeave={()=>setDragging(null)}
            onDrop={e=>{ e.preventDefault(); setDragging(null); const f=e.dataTransfer.files[0]; if(f)handleDocFile(f); }}
            onClick={()=>docRef.current?.click()}
            style={{ border:`2px dashed ${dragging==="doc"?"#22c55e":"#d1d5db"}`, borderRadius:10, padding:"18px 14px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, cursor:"pointer", background:dragging==="doc"?"#f0fdf4":"#fafafa", marginBottom:10 }}>
            <input type="file" ref={docRef} hidden accept=".txt,.md,.doc,.docx,.pdf"
              onChange={e=>{ const f=e.target.files?.[0]; if(f)handleDocFile(f); }}/>
            {docFile ? (
              <><div style={{ fontSize:22 }}>📄</div>
                <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{docFile.name}</div>
                <div style={{ fontSize:11, color:"#22c55e", fontWeight:600 }}>✓ Uploaded</div></>
            ) : (
              <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div style={{ fontSize:12, color:"#6b7280" }}><span style={{ color:"#22c55e", fontWeight:600 }}>Upload document</span> or drag & drop</div>
                <div style={{ fontSize:11, color:"#9ca3af" }}>.txt, .md, .doc, .pdf</div></>
            )}
          </div>
          {/* Manual paste text */}
          <label style={lbl}>Or Paste Text</label>
          <textarea rows={5} style={{ ...inp, resize:"vertical", lineHeight:1.7, marginBottom:8 }}
            placeholder="Paste your reading passage here..."
            value={readingContent.text}
            onChange={e => {
              const text = e.target.value;
              const wordcount = text.split(/\s+/).filter(Boolean).length;
              setReadingContent({ ...readingContent, text, wordcount });
            }}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:8 }}>
            <div>
              <label style={lbl}>Title</label>
              <input style={inp} value={readingContent.title}
                onChange={e=>setReadingContent({...readingContent, title: e.target.value})}/>
            </div>
          </div>
        </>
      )}

      {/* Material Upload — Listening */}
      {isListening && (
        <>
          <div style={sec}>Audio Material</div>
          <div
            onDragOver={e=>{ e.preventDefault(); setDragging("aud"); }}
            onDragLeave={()=>setDragging(null)}
            onDrop={e=>{ e.preventDefault(); setDragging(null); const f=e.dataTransfer.files[0]; if(f)handleAudFile(f); }}
            onClick={()=>audRef.current?.click()}
            style={{ border:`2px dashed ${dragging==="aud"?"#22c55e":"#d1d5db"}`, borderRadius:10, padding:"18px 14px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, cursor:"pointer", background:dragging==="aud"?"#f0fdf4":"#fafafa", marginBottom:10 }}>
            <input type="file" ref={audRef} hidden accept="audio/*"
              onChange={e=>{ const f=e.target.files?.[0]; if(f)handleAudFile(f); }}/>
            {audFile ? (
              <><div style={{ fontSize:22 }}>🎵</div>
                <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{audFile.name}</div>
                <div style={{ fontSize:11, color:"#22c55e", fontWeight:600 }}>✓ Uploaded</div></>
            ) : (
              <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <div style={{ fontSize:12, color:"#6b7280" }}><span style={{ color:"#22c55e", fontWeight:600 }}>Upload audio</span> or drag & drop</div>
                <div style={{ fontSize:11, color:"#9ca3af" }}>MP3, WAV, M4A, OGG</div></>
            )}
          </div>
          {/* Audio URL fallback */}
          <label style={lbl}>Or Paste URL</label>
          <input style={{ ...inp, marginBottom:8 }} value={audioContent.url.startsWith("blob:")?"":(audioContent.url)}
            onChange={e=>setAudioContent({...audioContent,url:e.target.value})} placeholder="https://..."/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            {[{label:"Title",key:"title"},{label:"Topic",key:"topic"},{label:"Difficulty",key:"difficulty"},{label:"Accent",key:"accent"}].map(f=>(
              <div key={f.key}>
                <label style={lbl}>{f.label}</label>
                <input style={inp} value={(audioContent as any)[f.key]}
                  onChange={e=>setAudioContent({...audioContent,[f.key]:e.target.value})}/>
              </div>
            ))}
          </div>
          <label style={lbl}>Transcript (full)</label>
          <textarea rows={4} style={{ ...inp, resize:"none", lineHeight:1.7 }}
            placeholder="Paste audio transcript here..."
            value={audioContent.transcript.full}
            onChange={e=>setAudioContent({...audioContent,transcript:{...audioContent.transcript,full:e.target.value}})}/>
        </>
      )}

      <div style={hr}/>
      <div style={sec}>Advanced</div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:13, color:"#374151" }}>AI Generated</span>
        <button onClick={()=>setMeta({...meta,aiGenerated:!meta.aiGenerated})}
          style={{ width:38, height:21, borderRadius:11, border:"none", background:meta.aiGenerated?"#22c55e":"#d1d5db", position:"relative", cursor:"pointer", transition:"background 0.2s" }}>
          <div style={{ width:15, height:15, borderRadius:"50%", background:"white", position:"absolute", top:3, left:meta.aiGenerated?20:3, transition:"left 0.2s" }}/>
        </button>
      </div>
    </div>
  );
}

// ─── Question Card ──────────────────────────────────────────────────────────────
function QuestionCard({
  q, index, isSelected, onSelect, onChange, onDelete,
}: {
  q: Question; index: number; isSelected: boolean;
  onSelect: () => void; onChange: (q: Question) => void; onDelete: () => void;
}) {
  const isEditing = isSelected;
  const isMultiple  = q.questionType === "MCQ";
  const isTrueFalse = q.questionType === "T-F-NG";
  const isFill      = false;

  const updateOption = (idx: number, patch: Partial<Option>) => {
    const opts = q.options.map((o, i) => i === idx ? { ...o, ...patch } : o);
    onChange({ ...q, options: opts });
  };

  const setCorrect = (idx: number) => {
    const opts = q.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
    onChange({ ...q, options: opts });
  };

  const toggleCorrect = (idx: number) => {
    const opts = q.options.map((o, i) => i === idx ? { ...o, isCorrect: !o.isCorrect } : o);
    onChange({ ...q, options: opts });
  };

  const addOption = () => {
    const letters = ["A","B","C","D","E","F"];
    const nextId = letters[q.options.length] || uid();
    onChange({ ...q, options: [...q.options, mkOption(nextId)] });
  };
  const removeOption = (idx: number) => onChange({ ...q, options: q.options.filter((_,i)=>i!==idx) });

  const optionLetters = ["A","B","C","D","E","F"];

  return (
    <div onClick={onSelect}
      style={{ border: `1.5px solid ${isEditing?"#22c55e":"#e5e7eb"}`, borderRadius:12, background:"white", padding: "18px 20px", cursor: isEditing?"default":"pointer", boxShadow: isEditing?"0 0 0 3px rgba(34,197,94,0.1)":"none", transition:"border-color 0.15s, box-shadow 0.15s" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: isEditing ? 16 : 8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14, fontWeight:700, color:"#111" }}>Question {index + 1}</span>
          <span style={{ fontSize:10, fontWeight:700, background: isEditing?"#f0fdf4":"#f3f4f6", color: isEditing?"#22c55e":"#9ca3af", padding:"2px 8px", borderRadius:20, letterSpacing:"0.04em" }}>
            {isEditing ? "EDITING" : q._status.toUpperCase()}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, color:"#9ca3af" }}>{q.questionType}</span>
          <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{q.points} pt</span>
          {!isEditing && (
            <button onClick={e=>{e.stopPropagation();onDelete();}} style={{ background:"none", border:"none", cursor:"pointer", color:"#d1d5db", fontSize:16, lineHeight:1, padding:2 }}>×</button>
          )}
          {isEditing && (
            <button onClick={e=>{e.stopPropagation();}} style={{ background:"none", border:"none", cursor:"pointer", color:"#d1d5db", padding:2 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Collapsed preview */}
      {!isEditing && (
        <div style={{ fontSize:13, color:"#6b7280", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {q.questionText || "Click to edit question..."}
        </div>
      )}

      {/* Editing state */}
      {isEditing && (
        <>
          {/* Question Text */}
          <div style={{ marginBottom:14 }}>
            <label style={{ ...lbl, marginBottom:6 }}>Question Text</label>
            {/* Mini formatting bar */}
            <div style={{ display:"flex", gap:4, marginBottom:6 }}>
              {[{l:"B",s:{fontWeight:800}},{l:"I",s:{fontStyle:"italic"}},{l:"🔗",s:{}},{l:"🖼",s:{}}].map((b,i)=>(
                <button key={i} style={{ width:28, height:28, border:"1px solid #e5e7eb", borderRadius:5, background:"white", cursor:"pointer", fontSize:12, color:"#6b7280", display:"flex", alignItems:"center", justifyContent:"center", ...b.s }}>{b.l}</button>
              ))}
            </div>
            <div style={{ border:"1px solid #e5e7eb", borderRadius:8, minHeight:70, padding:"10px 12px", fontSize:13, color:"#374151", outline:"none", position:"relative" }}>
              <div contentEditable suppressContentEditableWarning
                onBlur={e => onChange({ ...q, questionText: e.currentTarget.innerText })}
                style={{ outline:"none", minHeight:50, lineHeight:1.7 }}>
                {q.questionText || ""}
              </div>
              {/* AI image button */}
              <button style={{ position:"absolute", bottom:8, right:8, width:26, height:26, borderRadius:5, border:"1px solid #e5e7eb", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </button>
            </div>
          </div>

          {/* Points */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:13, color:"#374151", fontWeight:500 }}>Points</span>
            <div style={{ display:"flex", alignItems:"center", border:"1px solid #e5e7eb", borderRadius:7, overflow:"hidden" }}>
              <button onClick={()=>onChange({...q,points:Math.max(0,q.points-1)})} style={{ width:28, height:28, border:"none", background:"white", cursor:"pointer", fontSize:15, color:"#6b7280" }}>−</button>
              <span style={{ width:32, textAlign:"center", fontSize:13, fontWeight:600, color:"#111", borderLeft:"1px solid #e5e7eb", borderRight:"1px solid #e5e7eb", lineHeight:"28px" }}>{q.points}</span>
              <button onClick={()=>onChange({...q,points:q.points+1})} style={{ width:28, height:28, border:"none", background:"white", cursor:"pointer", fontSize:15, color:"#6b7280" }}>+</button>
            </div>
          </div>

          {/* Answer Type */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Answer Type</label>
            <div style={{ position:"relative" }}>
              <select value={q.questionType}
                onChange={e => onChange({ ...q, questionType: e.target.value as QuestionType, options: e.target.value === "T-F-NG" ? [{optionId:uid(),text:"True",isCorrect:false},{optionId:uid(),text:"False",isCorrect:false}] : q.options })}
                style={{ ...inp, appearance:"none", paddingRight:32, cursor:"pointer" }}>
                {(["MCQ","T-F-NG","SHORT ANSWER"] as QuestionType[]).map(t=><option key={t}>{t}</option>)}
              </select>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>

          {/* Options — Multiple Choice */}
          {(isMultiple || isTrueFalse) && (
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Options</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {q.options.map((opt,i)=>(
                  <div key={opt.optionId} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {/* Radio / correct toggle */}
                    <button onClick={()=>isMultiple?setCorrect(i):toggleCorrect(i)}
                      style={{ width:22, height:22, borderRadius:"50%", border:`2px solid ${opt.isCorrect?"#22c55e":"#d1d5db"}`, background:opt.isCorrect?"#22c55e":"white", flexShrink:0, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {opt.isCorrect && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af", width:14, flexShrink:0 }}>{optionLetters[i]}</span>
                    <div style={{ flex:1, border:`1.5px solid ${opt.isCorrect?"#22c55e":"#e5e7eb"}`, borderRadius:8, background:opt.isCorrect?"#f0fdf4":"white", padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <input value={opt.text} onChange={e=>updateOption(i,{text:e.target.value})}
                        placeholder={`Option ${optionLetters[i]}`}
                        style={{ border:"none", outline:"none", fontSize:13, color:"#374151", background:"transparent", flex:1, fontWeight: opt.isCorrect?600:400 }}/>
                      {!isTrueFalse && (
                        <button onClick={()=>removeOption(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#d1d5db", fontSize:14, lineHeight:1 }}>×</button>
                      )}
                    </div>
                  </div>
                ))}
                {isMultiple && q.options.length < 6 && (
                  <button onClick={addOption} style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:"#22c55e", padding:"4px 0" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Option
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Short answer */}
          {q.questionType === "SHORT ANSWER" && (
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Accepted Answers</label>
              <textarea rows={2} style={{ ...inp, resize:"none", lineHeight:1.7 }}
                placeholder="List accepted answers, one per line (max 3 words each)"
                value={q.acceptedAnswers.join("\n")}
                onChange={e => {
                  const lines = e.target.value.split("\n");
                  // Optional: filter out lines that have > 3 words immediately
                  // For better UX we just let them type but show a warning if any line is invalid
                  onChange({...q, acceptedAnswers: lines});
                }}/>
                {q.acceptedAnswers.some(ans => ans.trim().split(/\s+/).filter(Boolean).length > 3) && (
                  <p style={{ fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: 500 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Each answer must be 3 words or less.
                  </p>
                )}
            </div>
          )}

          {/* Explanation */}
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <label style={{ ...lbl, margin:0 }}>Explanation</label>
              <button style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, fontSize:11, fontWeight:600, color:"#22c55e", cursor:"pointer" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                AI Explain
              </button>
            </div>
            <textarea rows={2} style={{ ...inp, resize:"none", lineHeight:1.7 }}
              placeholder="Explain the correct answer..."
              value={q.explanation}
              onChange={e=>onChange({...q,explanation:e.target.value})}/>
          </div>

          {/* Hint */}
          <div style={{ marginTop:10 }}>
            <label style={lbl}>Hint (optional)</label>
            <input style={inp} value={q.hint} placeholder="Give students a helpful hint..."
              onChange={e=>onChange({...q,hint:e.target.value})}/>
          </div>
        </>
      )}
    </div>
  );
}


// ─── Reading Material Block ────────────────────────────────────────────────────
function ReadingMaterialBlock({
  content, onChange, onTabSwitch,
}: {
  content: ReadingContent;
  onChange: (r: ReadingContent) => void;
  onTabSwitch: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText]           = useState("");
  const [dragging, setDragging]             = useState(false);
  const hasContent = content.text.length > 0;

  const handleFile = (file: File) => {
    if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      const reader = new FileReader();
      reader.onload = e => {
        const text = (e.target?.result as string) || "";
        const wordcount = text.split(/\s+/).filter(Boolean).length;
        onChange({ ...content, title: file.name.replace(/\.[^.]+$/, ""), text, wordcount });
      };
      reader.readAsText(file);
    } else {
      onChange({ ...content, title: file.name.replace(/\.[^.]+$/, "") });
    }
  };

  const applyPaste = () => {
    const wordcount = pasteText.split(/\s+/).filter(Boolean).length;
    onChange({ ...content, text: pasteText, wordcount });
    setShowPasteModal(false);
    setPasteText("");
  };

  return (
    <div style={{ background: "white", border: "1.5px solid #e5e7eb", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: hasContent ? "1px solid #f3f4f6" : "none" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Reading Material</span>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Paste Article */}
          <button onClick={() => setShowPasteModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Paste Article
          </button>
          {/* AI Simplify */}
          <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "none", borderRadius: 7, background: "#f0fdf4", fontSize: 12, fontWeight: 600, color: "#22c55e", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            AI Simplify
          </button>
        </div>
      </div>

      {/* Empty state — upload zone */}
      {!hasContent && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{ margin: "16px 20px 20px", border: `2px dashed ${dragging ? "#22c55e" : "#e5e7eb"}`, borderRadius: 10, padding: "36px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", background: dragging ? "#f0fdf4" : "#fafafa", transition: "all 0.15s" }}>
          <input type="file" ref={fileRef} hidden accept=".txt,.md,.doc,.docx,.pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Upload your reading passage</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Drag & drop a <strong>.txt, .md, .doc</strong> or <strong>.pdf</strong> file here
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ height: 1, width: 40, background: "#e5e7eb" }}/>
            <span style={{ fontSize: 11, color: "#c4c4c4" }}>or</span>
            <div style={{ height: 1, width: 40, background: "#e5e7eb" }}/>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={e => { e.stopPropagation(); setShowPasteModal(true); }}
              style={{ padding: "6px 14px", border: "1.5px solid #22c55e", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 600, color: "#22c55e", cursor: "pointer" }}>
              Paste text
            </button>
            <button onClick={e => { e.stopPropagation(); onTabSwitch(); }}
              style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 500, color: "#6b7280", cursor: "pointer" }}>
              Open Settings
            </button>
          </div>
        </div>
      )}

      {/* Filled state — content */}
      {hasContent && (
        <div style={{ padding: "0 20px 20px" }}>
          {/* Format toolbar */}
          <div style={{ display: "flex", gap: 4, paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6", marginBottom: 14 }}>
            {[
              { l: "B", extra: { fontWeight: 800 } },
              { l: "I", extra: { fontStyle: "italic" as const } },
              { l: "U", extra: { textDecoration: "underline" as const } },
              { l: "🔗", extra: {} },
              { l: "🖼", extra: {} },
            ].map((b, i) => (
              <button key={i} style={{ width: 30, height: 30, border: "1px solid #e5e7eb", borderRadius: 6, background: "white", cursor: "pointer", fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", ...b.extra }}>{b.l}</button>
            ))}
            {/* Clear/replace button */}
            <button onClick={() => onChange({ ...content, text: "", wordcount: 0 })}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff5f5", fontSize: 11, fontWeight: 600, color: "#ef4444", cursor: "pointer" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Clear
            </button>
          </div>
          {/* Title */}
          {content.title && (
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111", marginBottom: 14 }}>{content.title}</h2>
          )}
          {/* Metadata badges */}
          {content.wordcount > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 600, background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: 4 }}>{content.wordcount} words</span>
            </div>
          )}
          {/* Text */}
          <div style={{ fontSize: 14, lineHeight: 1.85, color: "#374151", marginBottom: 14, whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: content.text }} />
        </div>
      )}

      {/* Paste Article Modal */}
      {showPasteModal && (
        <div onClick={() => setShowPasteModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 14, padding: 24, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Paste Reading Passage</h3>
              <button onClick={() => setShowPasteModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <textarea
              autoFocus rows={10}
              style={{ ...inp, resize: "none", lineHeight: 1.7, marginBottom: 14, fontSize: 13 }}
              placeholder={"Paste your article or reading passage here...\n\nSeparate paragraphs with a blank line."}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}/>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Title (optional)</label>
              <input style={inp} placeholder="e.g. The Art of Professional Emails"
                value={content.title}
                onChange={e => onChange({ ...content, title: e.target.value })}/>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[{label:"Category",key:"category"},{label:"Source",key:"source"},{label:"CEFR",key:"cefr"}].map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <input style={inp} value={(content as any)[f.key]}
                    onChange={e => onChange({ ...content, [f.key]: e.target.value })}/>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowPasteModal(false)} style={{ padding: "9px 18px", border: "1px solid #e5e7eb", borderRadius: 8, background: "white", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancel</button>
              <button onClick={applyPaste} disabled={!pasteText.trim()} style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: pasteText.trim() ? "#22c55e" : "#d1d5db", color: "white", fontSize: 13, fontWeight: 600, cursor: pasteText.trim() ? "pointer" : "not-allowed" }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Audio Material Block ──────────────────────────────────────────────────────
function AudioMaterialBlock({
  content, onChange, onTabSwitch, onFileUpload
}: {
  content: AudioContent;
  onChange: (a: AudioContent) => void;
  onTabSwitch: () => void;
  onFileUpload: (f: File) => void;
}) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [dragging,    setDragging]    = useState(false);
  const [playing,     setPlaying]     = useState(false);
  const [progress,    setProgress]    = useState(0);   // 0–100
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDurationState] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const hasContent = !!(content.url || content.title);

  const handleFile = (file: File) => {
    onFileUpload(file);
    const url = URL.createObjectURL(file);
    onChange({ ...content, url, title: file.name.replace(/\.[^.]+$/, "") });
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
      setPlaying(false);
    }
  }, [content.url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { 
      audioRef.current.pause(); 
      setPlaying(false); 
    } else { 
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setPlaying(true)).catch(e => {
          console.error("Audio playback failed", e);
          setPlaying(false);
        });
      } else {
        setPlaying(true);
      }
    }
  };

  const formatTime = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  return (
    <div style={{ background: "white", border: "1.5px solid #e5e7eb", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: hasContent ? "1px solid #f3f4f6" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Audio Material</span>
          {hasContent && (
            <span style={{ fontSize: 11, fontWeight: 600, background: "#fef9c3", color: "#d97706", padding: "2px 8px", borderRadius: 10 }}>
              {content.accent || "Audio"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasContent && (
            <button onClick={() => onChange({ url:"", duration:0, title:"", difficulty:"", topic:"", accent:"", transcript:{ full:"", timestamped:[] } })}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid #fecaca", borderRadius: 7, background: "#fff5f5", fontSize: 11, fontWeight: 600, color: "#ef4444", cursor: "pointer" }}>
              Replace audio
            </button>
          )}
          <button onClick={() => setShowTranscript(p => !p)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 500, color: "#374151", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Transcript
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!hasContent && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{ margin: "16px 20px 20px", border: `2px dashed ${dragging ? "#22c55e" : "#e5e7eb"}`, borderRadius: 10, padding: "36px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", background: dragging ? "#f0fdf4" : "#fafafa", transition: "all 0.15s" }}>
          <input type="file" ref={fileRef} hidden accept="audio/*"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fef9c3", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Upload your audio file</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Drag & drop <strong>MP3, WAV, M4A</strong> or <strong>OGG</strong> here
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ height: 1, width: 40, background: "#e5e7eb" }}/>
            <span style={{ fontSize: 11, color: "#c4c4c4" }}>or</span>
            <div style={{ height: 1, width: 40, background: "#e5e7eb" }}/>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
              style={{ padding: "6px 14px", border: "1.5px solid #22c55e", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 600, color: "#22c55e", cursor: "pointer" }}>
              Browse file
            </button>
            <button onClick={e => { e.stopPropagation(); onTabSwitch(); }}
              style={{ padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 7, background: "white", fontSize: 12, fontWeight: 500, color: "#6b7280", cursor: "pointer" }}>
              Paste URL instead
            </button>
          </div>
        </div>
      )}

      {/* Audio player */}
      {hasContent && (
        <div style={{ padding: "14px 20px 18px" }}>
          {/* Hidden audio element */}
          {content.url && (
            <audio ref={audioRef} src={content.url}
              onTimeUpdate={() => {
                if (!audioRef.current) return;
                const t = audioRef.current.currentTime;
                const d = audioRef.current.duration || 1;
                setCurrentTime(t); setProgress((t / d) * 100);
              }}
              onLoadedMetadata={() => {
                if (audioRef.current) setDurationState(audioRef.current.duration);
              }}
              onEnded={() => setPlaying(false)}/>
          )}

          {/* Info row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{content.title || "Audio file"}</span>
            {content.difficulty && <span style={{ fontSize: 11, fontWeight: 600, background: "#f0fdf4", color: "#16a34a", padding: "2px 7px", borderRadius: 4 }}>{content.difficulty}</span>}
            {content.topic && <span style={{ fontSize: 11, color: "#9ca3af" }}>• {content.topic}</span>}
          </div>

          {/* Player */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
            {/* Play/Pause */}
            <button onClick={togglePlay}
              style={{ width: 38, height: 38, borderRadius: "50%", background: "#22c55e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(34,197,94,0.3)" }}>
              {playing
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
              }
            </button>
            {/* Waveform + seek bar */}
            <div style={{ flex: 1 }}>
              {/* Fake waveform bars */}
              <div style={{ display: "flex", alignItems: "center", gap: 2, height: 28, marginBottom: 4 }}>
                {Array.from({ length: 48 }, (_, i) => {
                  const h = [8,14,20,16,10,18,24,12,22,16,8,18,26,14,20,12,16,24,10,18,14,22,16,8,20,18,12,24,10,16,20,14,8,18,22,12,16,24,10,18,14,20,16,8,22,18,12,24][i % 48] || 10;
                  const pct = (i / 48) * 100;
                  return <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: pct <= progress ? "#22c55e" : "#d1d5db", flexShrink: 0, transition: "background 0.1s" }}/>;
                })}
              </div>
              {/* Seek bar */}
              <input type="range" min={0} max={100} value={progress}
                onChange={e => {
                  const pct = +e.target.value;
                  setProgress(pct);
                  if (audioRef.current) audioRef.current.currentTime = (pct / 100) * (audioRef.current.duration || 0);
                }}
                style={{ width: "100%", height: 3, accentColor: "#22c55e", cursor: "pointer" }}/>
            </div>
            {/* Time */}
            <span style={{ fontSize: 12, color: "#9ca3af", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Transcript drawer */}
          {showTranscript && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Transcript</div>
              {content.transcript.full ? (
                <p style={{ fontSize: 13, lineHeight: 1.8, color: "#374151" }}>{content.transcript.full}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>No transcript added yet.</p>
                  <button onClick={() => onTabSwitch()}
                    style={{ alignSelf: "flex-start", padding: "5px 12px", border: "1.5px solid #22c55e", borderRadius: 6, background: "none", fontSize: 12, fontWeight: 600, color: "#22c55e", cursor: "pointer" }}>
                    Add in Settings →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AIMessage {
  id:       string;
  role:     "user" | "ai";
  text:     string;
  // Pending AI suggestions — shown below the message with accept/dismiss buttons
  pending?: {
    questions: AIQuestion[];
    passage:   AIPassage   | null;
    audio:     AIAudioContent | null;
    logId:     string;
  };
}

// ─── AIPanel ──────────────────────────────────────────────────────────────────
function AIPanel({
  exerciseId,
  exerciseMeta,
  questions,
  readingContent,
  audioContent,
  onAcceptQuestions,
  onAcceptPassage,
  onAcceptAudio,
}: {
  exerciseId:        string;
  exerciseMeta:      ExerciseMeta;
  questions:         Question[];
  readingContent:    ReadingContent;
  audioContent:      AudioContent;
  // Callbacks — ExerciseCreate handles actual state updates
  onAcceptQuestions: (qs: AIQuestion[], logId: string) => void;
  onAcceptPassage:   (p: AIPassage,    logId: string) => void;
  onAcceptAudio:     (a: AIAudioContent, logId: string) => void;
}) {
  const [messages,  setMessages]  = useState<AIMessage[]>([
    { id: uid(), role: "ai", text: `Hello! I'm your AI exercise assistant.\n\nI can:\n• Generate questions from your ${exerciseMeta.type} material\n• Create a reading passage or audio transcript\n• Upload a document to build questions automatically\n\nWhat would you like me to do?` },
  ]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const scrollRef               = useRef<HTMLDivElement>(null);
  const fileRef                 = useRef<HTMLInputElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const hasPassage = readingContent.text.length > 0;
  const hasAudio   = !!(audioContent.url || audioContent.title);

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = async (text?: string, documentText?: string) => {
    const msg = (text || input).trim();
    if ((!msg && !documentText) || loading) return;
    setInput("");

    const displayText = documentText
      ? `📄 Document uploaded — ${msg || "generating exercise content..."}`
      : msg;

    setMessages(p => [...p, { id: uid(), role: "user", text: displayText }]);
    setLoading(true);

    try {
      const result = await generateExerciseContent({
        exerciseId:       exerciseId || "draft",
        userPrompt:       msg || "Generate exercise content from this document.",
        documentText,
        exerciseMeta: {
          title:       exerciseMeta.title,
          type:        exerciseMeta.type,
          description: exerciseMeta.description,
          cefr:        "B1", // could come from meta if you add it
        },
        currentQuestions: summarizeQuestions(questions),
        hasPassage,
        hasAudio,
      });

      const { reasoning, suggestedQuestions, suggestedPassage, suggestedAudio, logId } = result;

      // Build summary for the AI message
      const parts: string[] = [reasoning];
      if (suggestedQuestions.length > 0)
        parts.push(`\n✓ ${suggestedQuestions.length} question${suggestedQuestions.length !== 1 ? "s" : ""} generated`);
      if (suggestedPassage)
        parts.push(`✓ Reading passage generated: "${suggestedPassage.title}"`);
      if (suggestedAudio)
        parts.push(`✓ Audio transcript generated: "${suggestedAudio.title}"`);

      setMessages(p => [...p, {
        id:   uid(),
        role: "ai",
        text: parts.join("\n"),
        pending: {
          questions: suggestedQuestions,
          passage:   suggestedPassage,
          audio:     suggestedAudio,
          logId,
        },
      }]);

    } catch (err: any) {
      setMessages(p => [...p, { id: uid(), role: "ai", text: `Error: ${err?.message ?? "Something went wrong. Please try again."}` }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Accept all suggestions from a message ────────────────────────────────────
  const handleAcceptAll = async (pending: NonNullable<AIMessage["pending"]>) => {
    if (pending.questions.length > 0)  onAcceptQuestions(pending.questions, pending.logId);
    if (pending.passage)               onAcceptPassage(pending.passage, pending.logId);
    if (pending.audio)                 onAcceptAudio(pending.audio, pending.logId);
    await markExerciseLogAccepted(pending.logId);
    // Clear the pending state so the buttons disappear
    setMessages(p => p.map(m =>
      m.pending?.logId === pending.logId ? { ...m, pending: undefined } : m
    ));
  };

  const handleDismiss = (logId: string) => {
    setMessages(p => p.map(m =>
      m.pending?.logId === logId ? { ...m, pending: undefined } : m
    ));
  };

  // ── File upload ───────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = ev => send(undefined, ev.target?.result as string);
    reader.onerror = () => setMessages(p => [...p, { id: uid(), role: "ai", text: "Failed to read the file. Please try a .txt or .md file." }]);
    reader.readAsText(file);
  };

  const QUICK_PROMPTS = [
    `Generate 4 questions for this ${exerciseMeta.type} exercise`,
    "Create a True/False question about the main idea",
    "Add vocabulary questions from the material",
    `Generate a ${exerciseMeta.type === "Reading" ? "reading passage" : "transcript"} about this topic`,
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Hidden file input */}
      <input type="file" ref={fileRef} hidden accept=".txt,.md" onChange={handleFileUpload}/>

      {/* Header bar */}
      <div style={{ padding:"8px 14px", borderBottom:"1px solid #f3f4f6", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e" }}/>
          <span style={{ fontSize:12, color:"#374151", fontWeight:500 }}>AI Context Active</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:20, padding:"2px 10px" }}>
          <span style={{ fontSize:12 }}>😊</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#d97706" }}>Friendly</span>
        </div>
      </div>

      {/* Tone */}
      <div style={{ padding:"5px 14px", borderBottom:"1px solid #f3f4f6", flexShrink:0 }}>
        <span style={{ fontSize:11, color:"#9ca3af" }}>
          {exerciseMeta.type} exercise · {questions.length} question{questions.length !== 1?"s":""} · {hasPassage ? "Passage ✓" : "No passage"} {hasAudio ? "· Audio ✓" : ""}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map(msg => (
          <div key={msg.id}>
            {/* Bubble */}
            <div style={{ display:"flex", gap:7, justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
              {msg.role === "ai" && (
                <div style={{ width:24, height:24, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
              )}
              <div style={{ background:msg.role==="user"?"#22c55e":"#f3f4f6", color:msg.role==="user"?"white":"#374151", padding:"8px 11px", borderRadius:msg.role==="user"?"13px 13px 2px 13px":"13px 13px 13px 2px", fontSize:12, lineHeight:1.6, maxWidth:"80%", whiteSpace:"pre-line", order:msg.role==="user"?1:2 }}>
                {msg.text}
              </div>
              {msg.role === "user" && (
                <div style={{ width:24, height:24, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2, order:2 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              )}
            </div>

            {/* AI reactions */}
            {msg.role === "ai" && !msg.pending && (
              <div style={{ display:"flex", gap:5, marginTop:4, marginLeft:31 }}>
                {["👍","👎","⧉","↺"].map(icon => <button key={icon} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"#9ca3af", padding:1 }}>{icon}</button>)}
              </div>
            )}

            {/* Pending suggestions preview + Accept / Dismiss */}
            {msg.role === "ai" && msg.pending && (
              <div style={{ marginLeft:31, marginTop:8 }}>
                {/* Summary cards */}
                <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:9, padding:"10px 12px", marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:"0.05em", marginBottom:8 }}>
                    Ready to add
                  </div>

                  {/* Questions preview */}
                  {msg.pending.questions.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#374151", marginBottom:4 }}>
                        📝 {msg.pending.questions.length} Question{msg.pending.questions.length !== 1?"s":""}
                      </div>
                      {msg.pending.questions.slice(0, 3).map((q, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:6, padding:"4px 0", borderBottom: i < Math.min(msg.pending!.questions.length,3)-1 ? "1px solid #f3f4f6" : "none" }}>
                          <span style={{ fontSize:10, fontWeight:700, background:"#f0fdf4", color:"#22c55e", padding:"1px 5px", borderRadius:3, flexShrink:0, marginTop:1 }}>{q.questionType.split(" ").map(w=>w[0]).join("")}</span>
                          <span style={{ fontSize:11, color:"#374151", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{q.questionText}</span>
                        </div>
                      ))}
                      {msg.pending.questions.length > 3 && (
                        <div style={{ fontSize:10, color:"#9ca3af", paddingTop:4 }}>+{msg.pending.questions.length - 3} more...</div>
                      )}
                    </div>
                  )}

                  {/* Passage preview */}
                  {msg.pending.passage && (
                    <div style={{ marginBottom:8, padding:"6px 8px", background:"#eff6ff", borderRadius:6 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#2563eb" }}>
                        📖 Reading Passage: "{msg.pending.passage.title}"
                      </div>
                      <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>
                        {msg.pending.passage.wordcount} words
                      </div>
                    </div>
                  )}

                  {/* Audio preview */}
                  {msg.pending.audio && (
                    <div style={{ marginBottom:4, padding:"6px 8px", background:"#fffbeb", borderRadius:6 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#d97706" }}>
                        🔊 Audio Content: "{msg.pending.audio.title}"
                      </div>
                      <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>
                        {msg.pending.audio.topic} · {msg.pending.audio.accent} accent
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display:"flex", gap:7 }}>
                  <button onClick={() => handleAcceptAll(msg.pending!)}
                    style={{ flex:1, padding:"8px 0", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Add to Exercise
                  </button>
                  <button onClick={() => handleDismiss(msg.pending!.logId)}
                    style={{ padding:"8px 12px", background:"white", border:"1px solid #e5e7eb", borderRadius:8, color:"#9ca3af", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </div>
            <div style={{ background:"#f3f4f6", padding:"8px 11px", borderRadius:"13px 13px 13px 2px", fontSize:12, color:"#9ca3af" }}>Generating...</div>
          </div>
        )}

        {/* Quick prompts */}
        {!loading && (
          <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:4 }}>
            {QUICK_PROMPTS.map(q => (
              <button key={q} onClick={() => send(q)}
                style={{ textAlign:"left", background:"#22c55e", color:"white", border:"none", borderRadius:20, padding:"7px 13px", fontSize:11, fontWeight:500, cursor:"pointer", lineHeight:1.4 }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input row */}
      <div style={{ padding:"8px 12px", borderTop:"1px solid #f3f4f6", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
        {/* Doc upload */}
        <button onClick={() => fileRef.current?.click()} title="Upload .txt or .md file"
          style={{ width:26, height:26, borderRadius:6, border:"1px solid #e5e7eb", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <input value={input} disabled={loading}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask AI to help with questions..."
          style={{ flex:1, border:"none", outline:"none", fontSize:12, color:"#374151", background:"transparent" }}/>
        <button onClick={() => send()} disabled={loading || !input.trim()}
          style={{ width:26, height:26, borderRadius:"50%", background:loading?"#d1d5db":"#22c55e", border:"none", cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      {/* Quick action recs */}
      <div style={{ padding:"8px 14px 12px", borderTop:"1px solid #f3f4f6", flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#374151", marginBottom:7 }}>Quick Actions</div>
        {[
          { bg:"#fde8e8", icon:"📄", label:"Generate from document", sub:"Upload .txt or .md", action:() => fileRef.current?.click() },
          { bg:"#f0fdf4", icon:"❓", label:"Comprehension questions",  sub:`For ${exerciseMeta.type} exercise`,    action:() => send(`Generate comprehension questions for this ${exerciseMeta.type} exercise`) },
          { bg:"#eff6ff", icon:"📖", label:exerciseMeta.type === "Reading" ? "Generate passage" : "Generate transcript", sub:"AI-written material", action:() => send(exerciseMeta.type === "Reading" ? "Generate a reading passage for this exercise" : "Generate an audio transcript for this exercise") },
        ].map(r => (
          <div key={r.label} onClick={r.action}
            style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"4px 4px", borderRadius:7, marginBottom:5 }}
            onMouseOver={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
            onMouseOut={e  => (e.currentTarget as HTMLElement).style.background = "transparent"}>
            <div style={{ width:28, height:28, borderRadius:7, background:r.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>{r.icon}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#111" }}>{r.label}</div>
              <div style={{ fontSize:10, color:"#9ca3af" }}>{r.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── Main Component ────────────────────────────────────────────────────────────
export default function ExerciseCreate() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user }   = useAuth();
  const stateData  = location.state as any;
  const courseId   = stateData?.courseId || stateData?.courseInfo?.courseId || "";
  const sectionId  = stateData?.sectionId || "";

  const [activeTab,      setActiveTab]      = useState<"settings"|"questions">("questions");
  const [selectedQ,      setSelectedQ]      = useState<number>(0);
  const [saving,         setSaving]         = useState(false);
  const [saveStatus,     setSaveStatus]     = useState<"saved"|"unsaved"|"saving">("unsaved");
  const [published,      setPublished]      = useState(false);
  const [studentView,    setStudentView]    = useState(false);
  const [collapseAll,    setCollapseAll]    = useState(false);
  const [loading,        setLoading]        = useState(true);

  const [meta, setMeta] = useState<ExerciseMeta>({
    title: "",
    description: "",
    type: stateData?.initialType || "Reading",
    metadata: { questionCount: 0, duration: 30, xpReward: 50, pointsReward: 10, passingScore: 70 },
    order: stateData?.order || 1,
    aiGenerated: false,
  });

  const [questions, setQuestions] = useState<Question[]>([]);

  const [readingContent, setReadingContent] = useState<ReadingContent>({
    title:"", wordcount:0, thumbnail:"", text:"",
  });

  const [audioContent, setAudioContent] = useState<AudioContent>({
    url:"", duration:0, title:"", difficulty:"", topic:"", accent:"",
    transcript:{ full:"", timestamped:[] },
  });

  const [createdAt, setCreatedAt] = useState<any>(null);

  const [audioFileObj, setAudioFileObj] = useState<File|null>(null);

  // ── Load existing data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId || !exerciseId || exerciseId === "new") {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const exerciseRef = doc(db, "courses", courseId, "exercises", exerciseId);
        const exerciseSnap = await getDoc(exerciseRef);

        if (exerciseSnap.exists()) {
          const data = exerciseSnap.data();
          setMeta({
            title: data.title || "",
            description: data.description || "",
            type: data.type || "Reading",
            metadata: data.metadata || { questionCount: 0, duration: 30, xpReward: 50, pointsReward: 10, passingScore: 70 },
            order: data.order || 1,
            aiGenerated: data.aiGenerated || false,
          });
          setCreatedAt(data.createdAt);

          // Load questions
          const q = query(
            collection(db, "courses", courseId, "exercises", exerciseId, "questions"),
            orderBy("order", "asc")
          );
          const qSnap = await getDocs(q);
          const qList: Question[] = [];
          qSnap.forEach(d => qList.push({ questionId: d.id, ...d.data(), _status: "active" } as Question));
          setQuestions(qList);

          // Load content
          const passageSnap = await getDoc(doc(db, "courses", courseId, "exercises", exerciseId, "content", "passage"));
          if (passageSnap.exists()) setReadingContent(passageSnap.data() as ReadingContent);

          const audioSnap = await getDoc(doc(db, "courses", courseId, "exercises", exerciseId, "content", "audio"));
          if (audioSnap.exists()) setAudioContent(audioSnap.data() as AudioContent);
        }
      } catch (err) {
        console.error("Error loading exercise:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [courseId, exerciseId]);

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const isReading   = meta.type === "Reading";
  const isListening = meta.type === "Listening";

  // ── Firestore Save ─────────────────────────────────────────────────────────
  const handleSave = async (andPublish = false) => {
    if (!courseId || !exerciseId) return;
    setSaving(true); setSaveStatus("saving");
    try {
      const exerciseRef = doc(db, "courses", courseId, "exercises", exerciseId);

      // Clean undefined fields
      const cleanMeta = Object.fromEntries(Object.entries(meta).filter(([_, v]) => v !== undefined));
      const cleanMetadata = Object.fromEntries(Object.entries(meta.metadata).filter(([_, v]) => v !== undefined));

      // 1. Exercise metadata document
      await setDoc(exerciseRef, {
        exerciseId,
        sectionId,
        ...cleanMeta,
        metadata: {
          ...cleanMetadata,
          questionCount: questions.length,
        },
        createdAt:   createdAt || serverTimestamp(),
        updatedAt:   serverTimestamp(),
      }, { merge: true });

      // 2. Questions subcollection (batch)
      const batch = writeBatch(db);
      
      // Fetch existing questions to find which ones to delete
      const qCollRef = collection(db, "courses", courseId, "exercises", exerciseId, "questions");
      const existingQSorted = await getDocs(qCollRef);
      const currentQIds = questions.map(q => q.questionId);
      
      existingQSorted.forEach(docSnap => {
        if (!currentQIds.includes(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });
      
      questions.forEach((q, idx) => {
        const qRef = doc(db, "courses", courseId, "exercises", exerciseId, "questions", q.questionId);
        const { _status, questionId, ...qData } = q;
        const cleanQData = Object.fromEntries(Object.entries(qData).filter(([_, v]) => v !== undefined));
        batch.set(qRef, {
          ...cleanQData,
          questionId,
          order: idx,
          aiGenerated: q.aiGenerated || false,
          acceptedAnswers: q.acceptedAnswers || [],
          options: q.options || [],
          explanation: q.explanation || "",
          hint: q.hint || "",
        }, { merge: true });
      });
      await batch.commit();

      // 3. Content subcollection
      if (meta.type === "Reading" || meta.type === "Speaking") {
        const cleanReading = Object.fromEntries(Object.entries(readingContent).filter(([_, v]) => v !== undefined));
        await setDoc(doc(db, "courses", courseId, "exercises", exerciseId, "content", "passage"), cleanReading, { merge: true });
      }
      if (meta.type === "Listening") {
        let finalAudioUrl = audioContent.url;
        if (audioFileObj) {
          const fileExt = audioFileObj.name.split('.').pop();
          const fileRef = ref(storage, `courses/${courseId}/exercises/${exerciseId}/audio_${Date.now()}.${fileExt}`);
          await uploadBytes(fileRef, audioFileObj);
          finalAudioUrl = await getDownloadURL(fileRef);
        }
        const cleanAudio = Object.fromEntries(Object.entries({ ...audioContent, url: finalAudioUrl }).filter(([_, v]) => v !== undefined));
        await setDoc(doc(db, "courses", courseId, "exercises", exerciseId, "content", "audio"), cleanAudio, { merge: true });
      }

      // 4. Update Course Sections
      if (stateData?.courseInfo) {
        // We must import updateSections, updateCourse from courseModel
        // but since we might not have it imported, we can just use setDoc/updateDoc
        const sectionsColl = collection(db, "courses", courseId, "sections");
        const sectionsSnap = await getDocs(sectionsColl);
        const sectionsList: any[] = [];
        sectionsSnap.forEach(d => sectionsList.push({ id: d.id, ...d.data() }));
        
        const us = sectionsList.map((s: any) => {
          if (s.id !== sectionId && s.sectionId !== sectionId) return s;
          const items = s.items || [];
          const ei = items.findIndex((i: any) => i.id === exerciseId);
          const order = ei >= 0 ? ei : items.length;
          const exItem = {
            id: exerciseId,
            kind: "exercise",
            number: order + 1,
            title: meta.title || "Untitled Exercise",
            type: meta.type || "Quiz",
            duration: meta.metadata?.duration || 30,
            questionCount: questions.length
          };
          const ni = [...items];
          if (ei >= 0) ni[ei] = exItem; else ni.push(exItem);
          
          // Update exercise document with order field
          setDoc(exerciseRef, {
            exerciseId,
            sectionId,
            ...cleanMeta,
            metadata: {
              ...cleanMetadata,
              questionCount: questions.length,
            },
            order: order,
            createdAt:   createdAt || serverTimestamp(),
            updatedAt:   serverTimestamp(),
          }, { merge: true });
          
          return { ...s, items: ni };
        });

        // Update section
        const targetSection = us.find((s:any) => s.id === sectionId || s.sectionId === sectionId);
        if (targetSection) {
          await setDoc(doc(db, "courses", courseId, "sections", targetSection.id || targetSection.sectionId), targetSection, { merge: true });
        }

        const tl = us.reduce((a:number, s:any) => a + (s.items||[]).filter((i:any)=>i.kind==="lesson").length, 0);
        const te = us.reduce((a:number, s:any) => a + (s.items||[]).filter((i:any)=>i.kind==="exercise").length, 0);
        await updateDoc(doc(db, "courses", courseId), { totalLessons: tl, totalExercises: te });
      }

      setSaveStatus("saved");
      if (andPublish) setPublished(true);
      setTimeout(() => navigate(-1), 500);
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save. Please try again.");
      setSaveStatus("unsaved");
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (idx: number, q: Question) => {
    const qs = [...questions]; qs[idx] = q; setQuestions(qs);
    setSaveStatus("unsaved");
  };

  const addQuestion = () => {
    const q = mkQuestion(questions.length);
    setQuestions([...questions, q]);
    setSelectedQ(questions.length);
    setSaveStatus("unsaved");
  };

  const deleteQuestion = (idx: number) => {
    setQuestions(questions.filter((_,i)=>i!==idx));
    if (selectedQ >= idx && selectedQ > 0) setSelectedQ(selectedQ-1);
    setSaveStatus("unsaved");
  };
  // ── Accept AI-generated questions ─────────────────────────────────────────────
const handleAcceptQuestions = (aiQs: AIQuestion[]) => {
    const newQuestions: Question[] = aiQs.map((aq, i) => ({
    questionId:      uid(),
    questionType:    aq.questionType,
    order:           questions.length + i,
    questionText:    aq.questionText,
    options:         aq.options,
    acceptedAnswers: aq.acceptedAnswers,
    explanation:     aq.explanation,
    hint:            aq.hint,
    points:          aq.points,
    aiGenerated:     true,
    _status:         "active" as const,
  }));
  setQuestions(prev => [...prev, ...newQuestions]);
  // Select the first new question
  setSelectedQ(questions.length);
  setActiveTab("questions");
  setSaveStatus("unsaved");
};

// ── Accept AI-generated reading passage ───────────────────────────────────────
const handleAcceptPassage = (p: AIPassage) => {
  setReadingContent({
    title:       p.title,
    wordcount:   p.wordcount,
    thumbnail:   p.thumbnail,
    text:        p.text,
  });
  setSaveStatus("unsaved");
};

// ── Accept AI-generated audio content ─────────────────────────────────────────
const handleAcceptAudio = (a: AIAudioContent) => {
  setAudioContent(prev => ({
    ...prev,
    title:      a.title,
    topic:      a.topic,
    difficulty: a.difficulty,
    accent:     a.accent,
    transcript: a.transcript,
  }));
  setSaveStatus("unsaved");
};
  if (loading) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f5f6fa", color:"#9ca3af", fontSize:14 }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
        <div style={{ width:32, height:32, border:"3px solid #e5e7eb", borderTopColor:"#22c55e", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
        Loading exercise...
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;overflow:hidden;font-family:'DM Sans',sans-serif}
        input,select,textarea,button{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:3px}
        .q-row:hover{background:#f9fafb!important}
        @keyframes spin { to { transform: rotate(360deg); } }

        .main-body { flex: 1; display: flex; min-height: 0; flex-direction: row; }
        .left-panel { width: 262px; background: white; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; flex-shrink: 0; min-height: 0; }
        .center-panel { flex: 1; overflow: auto; min-height: 0; padding: 20px 24px 60px; }
        .right-panel { width: 250px; background: white; border-left: 1px solid #e5e7eb; display: flex; flex-direction: column; flex-shrink: 0; min-height: 0; }

        @media (max-width: 1024px) {
          .right-panel { display: none !important; }
        }
        @media (max-width: 768px) {
          .main-body { flex-direction: column !important; overflow-y: auto !important; }
          .left-panel { width: 100% !important; border-right: none !important; border-bottom: 1px solid #e5e7eb !important; flex: none !important; max-height: 350px; }
          .center-panel { padding: 16px !important; overflow: visible !important; }
        }
      `}</style>

      <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#f5f6fa" }}>

        {/* ── Top Bar ─────────────────────────────────────────────────────── */}
        <div style={{ height:52, background:"white", borderBottom:"1px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", flexShrink:0, zIndex:50 }}>
          {/* Left */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>navigate(-1)} style={{ background:"none", border:"none", cursor:"pointer", color:"#6b7280", display:"flex", alignItems:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize:13, color:"#9ca3af" }} className="hide-mobile">{stateData?.courseTitle || stateData?.courseInfo?.title || "Course"}</span>
            <svg className="hide-mobile" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ fontSize:13, fontWeight:600, color:"#111" }}>{meta.title}</span>
            <button style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
          {/* Center — Student View toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }} className="hide-mobile">
            <span style={{ fontSize:13, color:"#374151" }}>Student View</span>
            <button onClick={()=>setStudentView(p=>!p)}
              style={{ width:42, height:24, borderRadius:12, border:"none", background:studentView?"#22c55e":"#d1d5db", position:"relative", cursor:"pointer", transition:"background 0.2s" }}>
              <div style={{ width:18, height:18, borderRadius:"50%", background:"white", position:"absolute", top:3, left:studentView?21:3, transition:"left 0.2s" }}/>
            </button>
          </div>
          {/* Right */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {saveStatus === "saved" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#22c55e", fontWeight:500 }} className="hide-mobile">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Saved
              </div>
            )}
            <button onClick={()=>handleSave(false)} disabled={saving}
              style={{ padding:"7px 16px", border:"1px solid #e5e7eb", borderRadius:8, background:"white", fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={()=>handleSave(true)} disabled={saving} className="hide-mobile"
              style={{ padding:"7px 18px", border:"none", borderRadius:8, background:"#22c55e", fontSize:13, fontWeight:600, color:"white", cursor:"pointer" }}>
              {published ? "Published ✓" : "Publish"}
            </button>
            <div style={{ width:32, height:32, borderRadius:"50%", background:"#22c55e", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {user?.displayName?.[0] || "T"}
            </div>
          </div>
        </div>

        {/* ── 3-col Body ───────────────────────────────────────────────────── */}
        <div className="main-body">

          {/* ── LEFT: Question list / Settings tabs ─────────────────────── */}
          <div className="left-panel">
            {/* Tabs */}
            <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
              {(["Settings","Question List"] as const).map(t=>(
                <button key={t} onClick={()=>setActiveTab(t==="Settings"?"settings":"questions")}
                  style={{ flex:1, padding:"13px 0", background:"none", border:"none", borderBottom:`2px solid ${(t==="Settings"?activeTab==="settings":activeTab==="questions")?"#22c55e":"transparent"}`, fontSize:13, fontWeight:600, color:(t==="Settings"?activeTab==="settings":activeTab==="questions")?"#22c55e":"#9ca3af", cursor:"pointer", transition:"color 0.15s,border-color 0.15s" }}>
                  {t}
                </button>
              ))}
            </div>

            {activeTab === "settings" ? (
              <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
                <SettingsPanel meta={meta} setMeta={setMeta}
                  readingContent={readingContent} setReadingContent={setReadingContent}
                  audioContent={audioContent}   setAudioContent={setAudioContent}
                  setAudioFileObj={setAudioFileObj}/>
              </div>
            ) : (
              <>
                {/* Question list header */}
                <div style={{ padding:"10px 14px", borderBottom:"1px solid #f3f4f6", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>TOTAL POINTS: {totalPoints}</span>
                  <button onClick={()=>setCollapseAll(p=>!p)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#22c55e", fontWeight:600 }}>
                    {collapseAll?"Expand All":"Collapse All"}
                  </button>
                </div>
                {/* Question rows */}
                <div style={{ flex:1, overflowY:"auto", minHeight:0, padding:"8px 10px" }}>
                  {questions.map((q, i) => (
                    <div key={q.questionId} className="q-row"
                      onClick={() => {
                        setSelectedQ(i);
                        document.getElementById(`question-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"10px 8px", borderRadius:8, marginBottom:3, border:`1.5px solid ${selectedQ===i?"#22c55e":"transparent"}`, background:selectedQ===i?"#f0fdf4":"transparent", cursor:"pointer", transition:"all 0.12s" }}>
                      {/* Drag dots */}
                      <svg width="10" height="14" viewBox="0 0 10 18" fill="#d1d5db" style={{ marginTop:2, flexShrink:0 }}>
                        <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
                        <circle cx="3" cy="9" r="1.5"/><circle cx="7" cy="9" r="1.5"/>
                        <circle cx="3" cy="15" r="1.5"/><circle cx="7" cy="15" r="1.5"/>
                      </svg>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:selectedQ===i?"#22c55e":"#374151" }}>Q{i+1} • {q.questionType}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:11, color:"#9ca3af" }}>{q.points} pt</span>
                            {selectedQ===i && <span style={{ fontSize:9, fontWeight:700, color:"#22c55e", background:"#dcfce7", padding:"1px 6px", borderRadius:10, letterSpacing:"0.05em" }}>EDITING</span>}
                          </div>
                        </div>
                        <div style={{ fontSize:11, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {q.questionText || "Click to edit..."}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Add question */}
                <div style={{ padding:"10px 14px", borderTop:"1px solid #f3f4f6", flexShrink:0 }}>
                  <button onClick={addQuestion}
                    style={{ width:"100%", padding:"10px 0", border:"2px dashed #d1d5db", borderRadius:8, background:"none", fontSize:13, fontWeight:600, color:"#9ca3af", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"border-color 0.15s,color 0.15s" }}
                    onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#22c55e";(e.currentTarget as HTMLButtonElement).style.color="#22c55e";}}
                    onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#d1d5db";(e.currentTarget as HTMLButtonElement).style.color="#9ca3af";}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Question
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── CENTER: Material + Question editor ──────────────────────── */}
          <div className="center-panel">

            {/* ── READING MATERIAL BLOCK — always visible for Reading type ── */}
            {isReading && (
              <ReadingMaterialBlock
                content={readingContent}
                onChange={setReadingContent}
                onTabSwitch={() => setActiveTab("settings")}
              />
            )}

            {/* ── AUDIO MATERIAL BLOCK — always visible for Listening type ── */}
            {isListening && (
              <AudioMaterialBlock
                content={audioContent}
                onChange={setAudioContent}
                onTabSwitch={() => setActiveTab("settings")}
                onFileUpload={setAudioFileObj}
              />
            )}

      {/* Question Cards */}
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {questions.map((q,i)=>(
                <div key={q.questionId} id={`question-${i}`}>
                  <QuestionCard q={q} index={i}
                    isSelected={selectedQ === i && activeTab === "questions"}
                    onSelect={()=>{ setSelectedQ(i); setActiveTab("questions"); }}
                    onChange={nq=>updateQuestion(i,nq)}
                    onDelete={()=>deleteQuestion(i)}/>
                </div>
              ))}
            </div>

            {/* Add question CTA */}
            <button onClick={addQuestion}
              style={{ width:"100%", marginTop:16, padding:"14px 0", border:"2px dashed #e5e7eb", borderRadius:10, background:"white", fontSize:13, fontWeight:600, color:"#9ca3af", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7, transition:"all 0.15s" }}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#22c55e";(e.currentTarget as HTMLButtonElement).style.color="#22c55e";}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#e5e7eb";(e.currentTarget as HTMLButtonElement).style.color="#9ca3af";}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Question
            </button>
          </div>

          {/* ── RIGHT: AI Panel ──────────────────────────────────────────── */}
          <div className="right-panel">
  <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>
    <AIPanel
      exerciseId={stateData?.exerciseId || "draft"}
      exerciseMeta={meta}
      questions={questions}
      readingContent={readingContent}
      audioContent={audioContent}
      onAcceptQuestions={(qs, logId) => handleAcceptQuestions(qs)}
      onAcceptPassage={(p, logId)    => handleAcceptPassage(p)}
      onAcceptAudio={(a, logId)      => handleAcceptAudio(a)}
    />
  </div>
</div>
        </div>

        {/* Auto-save indicator */}
        {saveStatus === "unsaved" && (
          <div style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#f59e0b", fontWeight:500, background:"white", padding:"6px 14px", borderRadius:20, boxShadow:"0 1px 8px rgba(0,0,0,0.08)", border:"1px solid #e5e7eb", pointerEvents:"none", zIndex:20 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Draft auto-saved · 2 minutes ago
          </div>
        )}
      </div>
    </>
  );
}