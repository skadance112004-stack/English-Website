import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router";
import {
  doc, setDoc, serverTimestamp, writeBatch, getDoc, collection, getDocs, query, orderBy,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../auth/AuthContext";
import { updateCourse, updateSections, type Section, type SectionItem, type ExerciseItem } from "../models/courseModel";
import {
  generateSpeakingContent, markSpeakingLogAccepted, summarizeLines,
  type AILine,
} from "../service/geminiSpeakingService";
import {
  batchGenerateTTS, prepareAILinesForTTS, VOICE_OPTIONS, DEFAULT_VOICE,
  type TTSLineResult,
} from "../service/ttsService";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface VocabHint { word: string; definition: string; }

interface Line {
  lineId:             string;
  order:              number;
  speaker:            "AI" | "Student";
  text:               string;
  audioUrl:           string;
  voiceName:          string;
  pronunciationFocus: string;
  vocabularyHelp:     VocabHint[];
  keyWords:           string[];
  studentHint:        string;
  configured:         boolean;
}

interface ScoringWeights {
  pronunciation: number;
  accuracy:      number;
  fluency:       number;
  completeness:  number;
}

interface ExerciseMeta {
  title:           string;
  description:     string;
  aiNativeVoice:   string;
  cefr:            string;
  pointsPerLine:   number;
  passingScore:    number;
  allowedAttempts: string;
  xpReward:        number;
  pointsReward:    number;
  aiGenerated:     boolean;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const mkLine = (order: number, speaker: "AI" | "Student" = "AI"): Line => ({
  lineId: uid(), order, speaker, text: "", audioUrl: "",
  voiceName: DEFAULT_VOICE,
  pronunciationFocus: "", vocabularyHelp: [], keyWords: [], studentHint: "",
  configured: false,
});

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px", border: "1px solid #e5e7eb",
  borderRadius: 7, fontSize: 13, color: "#111", background: "white", outline: "none",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280",
  textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 5,
};
const sec: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#9ca3af",
  textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8, marginTop: 18,
};

// ─── Inline audio player (used in ConversationCanvas for AI lines) ─────────────
function InlineAudioPlayer({ url }: { url: string }) {
  const audioRef  = useRef<HTMLAudioElement|null>(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5, padding:"5px 10px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:20 }}>
      <audio ref={audioRef} src={url}
        onTimeUpdate={() => { if (!audioRef.current) return; setProgress((audioRef.current.currentTime / (audioRef.current.duration || 1)) * 100); }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => { setPlaying(false); setProgress(0); }}/>
      <button onClick={() => {
        if (!audioRef.current) return;
        if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); setProgress(0); }
        else { audioRef.current.play(); setPlaying(true); }
      }} style={{ width:22, height:22, borderRadius:"50%", background:"#22c55e", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {playing
          ? <svg width="7" height="7" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="7" height="7" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>}
      </button>
      <div style={{ flex:1, height:3, background:"#d1fae5", borderRadius:2, position:"relative" }}>
        <div style={{ height:"100%", width:`${progress}%`, background:"#22c55e", borderRadius:2, transition:"width 0.1s" }}/>
      </div>
      {duration > 0 && <span style={{ fontSize:10, color:"#16a34a", fontWeight:600, flexShrink:0 }}>{fmt(duration)}</span>}
    </div>
  );
}

// ─── LineCard ──────────────────────────────────────────────────────────────────
function LineCard({ line, index, isSelected, onSelect, onChange, onDelete }: {
  line: Line; index: number; isSelected: boolean;
  onSelect: () => void; onChange: (l: Line) => void; onDelete: () => void;
}) {
  const [expanded,  setExpanded]  = useState(isSelected);
  const [aiExpanded, setAiExpanded] = useState(false);
  useEffect(() => { if (isSelected) setExpanded(true); }, [isSelected]);

  const isStudent    = line.speaker === "Student";
  const speakerColor = isStudent ? "#22c55e" : "#9ca3af";

  const addVocab    = () => onChange({ ...line, vocabularyHelp: [...line.vocabularyHelp, { word:"", definition:"" }] });
  const removeVocab = (i: number) => onChange({ ...line, vocabularyHelp: line.vocabularyHelp.filter((_,idx) => idx !== i) });
  const updateVocab = (i: number, patch: Partial<VocabHint>) => {
    const v = line.vocabularyHelp.map((x, idx) => idx === i ? { ...x, ...patch } : x);
    onChange({ ...line, vocabularyHelp: v });
  };

  // Group voices by accent for optgroup
  const byAccent: Record<string, typeof VOICE_OPTIONS> = {};
  VOICE_OPTIONS.forEach(v => { if (!byAccent[v.accent]) byAccent[v.accent] = []; byAccent[v.accent].push(v); });

  return (
    <div onClick={onSelect}
      style={{ border:`1.5px solid ${isSelected?"#22c55e":"#e5e7eb"}`, borderRadius:10, background:"white", marginBottom:8, overflow:"hidden", cursor:"pointer", boxShadow:isSelected?"0 0 0 3px rgba(34,197,94,0.08)":"none", transition:"border-color 0.15s,box-shadow 0.15s" }}>

      {/* Card header */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"10px 10px 8px" }}>
        <svg width="10" height="14" viewBox="0 0 10 18" fill="#d1d5db" style={{ marginTop:3, flexShrink:0 }}>
          <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
          <circle cx="3" cy="9" r="1.5"/><circle cx="7" cy="9" r="1.5"/>
          <circle cx="3" cy="15" r="1.5"/><circle cx="7" cy="15" r="1.5"/>
        </svg>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:12, fontWeight:700, color:speakerColor }}>{line.speaker}</span>
              {isStudent && line.configured && (
                <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, fontWeight:700, background:"#f0fdf4", color:"#16a34a", padding:"2px 7px", borderRadius:10 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e" }}/>Configured
                </span>
              )}
              {(line as any).aiGenerated && (
                <span style={{ fontSize:9, fontWeight:700, background:"#eff6ff", color:"#2563eb", padding:"1px 5px", borderRadius:8 }}>AI</span>
              )}
              {/* Audio ready badge */}
              {!isStudent && line.audioUrl && (
                <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, fontWeight:700, background:"#fef9c3", color:"#d97706", padding:"2px 7px", borderRadius:10 }}>
                  🔊 Voice Ready
                </span>
              )}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              {isStudent && (
                <button onClick={e => { e.stopPropagation(); setExpanded(p => !p); }}
                  style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", padding:2, display:"flex", alignItems:"center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {expanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                  </svg>
                </button>
              )}
              {!isStudent && (
                <button onClick={e => { e.stopPropagation(); setAiExpanded(p => !p); }}
                  style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", padding:2, display:"flex", alignItems:"center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {aiExpanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                  </svg>
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); onDelete(); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:"#d1d5db", padding:2, display:"flex", alignItems:"center" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              </button>
            </div>
          </div>

          {/* Text area */}
          <textarea value={line.text}
            onChange={e => onChange({ ...line, text: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder={isStudent ? "Student response text..." : `${line.speaker} says...`}
            rows={isStudent ? 2 : 3}
            style={{ ...inp, resize:"none", lineHeight:1.6, fontSize:12, padding:"6px 8px" }}/>
        </div>
      </div>

      {/* ── AI line: voice picker (expandable) ───────────────────────────── */}
      {!isStudent && aiExpanded && (
        <div onClick={e => e.stopPropagation()}
          style={{ borderTop:"1px solid #f3f4f6", padding:"10px 10px 12px", display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Voice for this line</span>
          </div>
          <div style={{ position:"relative" }}>
            <select value={line.voiceName || DEFAULT_VOICE}
              onChange={e => onChange({ ...line, voiceName: e.target.value })}
              style={{ ...inp, fontSize:12, padding:"6px 28px 6px 8px", appearance:"none", cursor:"pointer" }}>
              {Object.entries(byAccent).map(([accent, voices]) => (
                <optgroup key={accent} label={`${voices[0].flag} ${accent}`}>
                  {voices.map(v => <option key={v.id} value={v.id}>{v.name} · {v.gender}</option>)}
                </optgroup>
              ))}
            </select>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          {/* Mini player if audio ready */}
          {line.audioUrl && <InlineAudioPlayer url={line.audioUrl}/>}
        </div>
      )}

      {/* ── Student line: config (expandable) ────────────────────────────── */}
      {isStudent && expanded && (
        <div onClick={e => e.stopPropagation()}
          style={{ borderTop:"1px solid #f3f4f6", padding:"10px 10px 12px", display:"flex", flexDirection:"column", gap:10 }}>
          {/* Pronunciation Focus */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
              <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Pronunciation Focus</span>
            </div>
            <input style={{ ...inp, fontSize:12, padding:"6px 8px" }}
              value={line.pronunciationFocus}
              onChange={e => onChange({ ...line, pronunciationFocus: e.target.value })}
              placeholder="e.g. word stress on 'aggressive'"/>
          </div>
          {/* Vocabulary Help */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Vocabulary Help</span>
            </div>
            {line.vocabularyHelp.map((v, i) => (
              <div key={i} style={{ display:"flex", gap:4, marginBottom:5 }}>
                <input style={{ ...inp, fontSize:11, padding:"5px 7px", width:"40%" }} value={v.word} onChange={e => updateVocab(i, { word:e.target.value })} placeholder="Word"/>
                <input style={{ ...inp, fontSize:11, padding:"5px 7px", flex:1 }} value={v.definition} onChange={e => updateVocab(i, { definition:e.target.value })} placeholder="Definition"/>
                <button onClick={() => removeVocab(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#d1d5db", fontSize:14, padding:"0 2px" }}>×</button>
              </div>
            ))}
            {line.vocabularyHelp.filter(v => v.word).map((v, i) => (
              <div key={`prev-${i}`} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 8px", background:"#f0fdf4", borderRadius:6, marginBottom:3 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <span style={{ fontSize:11, fontWeight:700, color:"#16a34a" }}>{v.word}</span>
                <span style={{ fontSize:11, color:"#6b7280" }}>: {v.definition}</span>
              </div>
            ))}
            <button onClick={addVocab} style={{ display:"flex", alignItems:"center", gap:4, background:"none", border:"none", cursor:"pointer", fontSize:11, fontWeight:600, color:"#22c55e", padding:"2px 0" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add vocab
            </button>
          </div>
          {/* Key Words */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Key Words (for evaluation)</span>
            </div>
            <input style={{ ...inp, fontSize:12, padding:"6px 8px" }}
              value={line.keyWords.join(", ")}
              onChange={e => onChange({ ...line, keyWords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              placeholder="word1, word2, word3"/>
            {line.keyWords.length > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:3, marginTop:4 }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e" }}/>
                <span style={{ fontSize:11, color:"#6b7280" }}>{line.keyWords.length} key word{line.keyWords.length !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
          {/* Student Hint */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Student Hint</span>
            </div>
            <input style={{ ...inp, fontSize:12, padding:"6px 8px" }}
              value={line.studentHint}
              onChange={e => onChange({ ...line, studentHint: e.target.value })}
              placeholder="Hint shown to student before they respond"/>
          </div>
          <button onClick={() => onChange({ ...line, configured: !line.configured })}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:7, background:"#f9fafb", fontSize:11, fontWeight:600, color:"#374151", cursor:"pointer", width:"100%" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            {line.configured ? "✓ Auto-generate evaluation settings" : "Auto-generate evaluation settings"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Voice Settings Panel ─────────────────────────────────────────────────────
function VoiceSettingsPanel({
  globalVoice, setGlobalVoice,
  speechRate,  setSpeechRate,
  speechPitch, setSpeechPitch,
  lines, setLines,
  ttsGenerating, ttsProgress, ttsResults,
  onBatchGenerate,
}: {
  globalVoice:     string;
  setGlobalVoice:  (v: string) => void;
  speechRate:      number;
  setSpeechRate:   (v: number) => void;
  speechPitch:     number;
  setSpeechPitch:  (v: number) => void;
  lines:           Line[];
  setLines:        React.Dispatch<React.SetStateAction<Line[]>>;
  ttsGenerating:   boolean;
  ttsProgress:     { done: number; total: number } | null;
  ttsResults:      TTSLineResult[];
  onBatchGenerate: () => void;
}) {
  const aiLines   = lines.filter(l => l.speaker === "AI" && l.text.trim());
  const withAudio = aiLines.filter(l => l.audioUrl);

  const byAccent: Record<string, typeof VOICE_OPTIONS> = {};
  VOICE_OPTIONS.forEach(v => { if (!byAccent[v.accent]) byAccent[v.accent] = []; byAccent[v.accent].push(v); });

  const selectedVoice = VOICE_OPTIONS.find(v => v.id === globalVoice);

  return (
    <>
      <div style={sec}>AI Voice Settings</div>

      {/* Global voice selector */}
      <div style={{ position:"relative", marginBottom:8 }}>
        <select value={globalVoice}
          onChange={e => {
            const nv = e.target.value;
            setGlobalVoice(nv);
            setLines(prev => prev.map(l =>
              l.speaker === "AI" && (!l.voiceName || l.voiceName === globalVoice)
                ? { ...l, voiceName: nv } : l
            ));
          }}
          style={{ ...inp, appearance:"none", paddingRight:28, cursor:"pointer", fontSize:12 }}>
          {Object.entries(byAccent).map(([accent, voices]) => (
            <optgroup key={accent} label={`${voices[0].flag} ${accent}`}>
              {voices.map(v => <option key={v.id} value={v.id}>{v.name} · {v.gender}</option>)}
            </optgroup>
          ))}
        </select>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
          style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* Voice preview chip */}
      {selectedVoice && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, marginBottom:12 }}>
          <span style={{ fontSize:18 }}>{selectedVoice.flag}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{selectedVoice.name}</div>
            <div style={{ fontSize:11, color:"#9ca3af" }}>{selectedVoice.accent} English · {selectedVoice.gender}</div>
          </div>
          <span style={{ fontSize:10, fontWeight:600, background:selectedVoice.gender==="Female"?"#fce7f3":"#eff6ff", color:selectedVoice.gender==="Female"?"#be185d":"#2563eb", padding:"2px 8px", borderRadius:10 }}>
            {selectedVoice.gender}
          </span>
        </div>
      )}

      {/* Per-line overrides */}
      {aiLines.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", marginBottom:6 }}>
            Per-line voice override
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:130, overflowY:"auto" }}>
            {aiLines.map((l, i) => (
              <div key={l.lineId} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 7px", background:"#f9fafb", borderRadius:7, border:"1px solid #f3f4f6" }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#9ca3af", flexShrink:0, width:16 }}>{i+1}</span>
                <span style={{ flex:1, fontSize:11, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {l.text.slice(0, 30)}{l.text.length > 30 ? "..." : ""}
                </span>
                <div style={{ position:"relative", flexShrink:0 }}>
                  <select value={l.voiceName || globalVoice}
                    onChange={e => setLines(prev => prev.map(ln => ln.lineId === l.lineId ? { ...ln, voiceName: e.target.value } : ln))}
                    style={{ fontSize:10, padding:"3px 18px 3px 6px", border:"1px solid #e5e7eb", borderRadius:5, background:"white", appearance:"none", cursor:"pointer", color:"#374151" }}>
                    {VOICE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.flag} {v.name}</option>)}
                  </select>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
                    style={{ position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {/* Green dot = audio ready */}
                <div style={{ width:6, height:6, borderRadius:"50%", background:l.audioUrl?"#22c55e":"#d1d5db", flexShrink:0 }}
                  title={l.audioUrl?"Audio ready":"No audio"}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Speech Rate */}
      <div style={{ marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Speech Rate</span>
          <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>{speechRate.toFixed(1)}×</span>
        </div>
        <input type="range" min={0.5} max={2.0} step={0.1} value={speechRate}
          onChange={e => setSpeechRate(+e.target.value)}
          style={{ width:"100%", accentColor:"#22c55e", cursor:"pointer" }}/>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#9ca3af", marginTop:2 }}>
          <span>Slow</span><span>Normal</span><span>Fast</span>
        </div>
      </div>

      {/* Pitch */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Pitch</span>
          <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>
            {speechPitch === 0 ? "Normal" : `${speechPitch > 0 ? "+" : ""}${speechPitch}Hz`}
          </span>
        </div>
        <input type="range" min={-20} max={20} step={2} value={speechPitch}
          onChange={e => setSpeechPitch(+e.target.value)}
          style={{ width:"100%", accentColor:"#22c55e", cursor:"pointer" }}/>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#9ca3af", marginTop:2 }}>
          <span>Lower</span><span>Normal</span><span>Higher</span>
        </div>
      </div>

      {/* Progress / results */}
      {(withAudio.length > 0 || ttsResults.length > 0) && (
        <div style={{ padding:"8px 10px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>Audio Ready</span>
            <span style={{ fontSize:11, fontWeight:700, color:"#22c55e" }}>{withAudio.length}/{aiLines.length} lines</span>
          </div>
          <div style={{ height:4, background:"#e5e7eb", borderRadius:4 }}>
            <div style={{ height:"100%", width:aiLines.length>0?`${(withAudio.length/aiLines.length)*100}%`:"0%", background:"#22c55e", borderRadius:4, transition:"width 0.4s" }}/>
          </div>
          {ttsResults.length > 0 && (
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3 }}>
              {ttsResults.map(r => (
                <div key={r.lineId} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  {r.success
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                  <span style={{ fontSize:10, color:r.success?"#16a34a":"#ef4444" }}>
                    {r.success ? `Generated (${(r.durationMs/1000).toFixed(1)}s)` : r.error}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Batch generate button */}
      {aiLines.length === 0 ? (
        <div style={{ padding:"10px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, fontSize:12, color:"#d97706", textAlign:"center" as const }}>
          Add text to AI lines first, then generate voices.
        </div>
      ) : (
        <>
          <button onClick={onBatchGenerate} disabled={ttsGenerating}
            style={{ width:"100%", padding:"11px 0", border:"none", borderRadius:9, background:ttsGenerating?"#d1d5db":"#22c55e", color:"white", fontSize:13, fontWeight:700, cursor:ttsGenerating?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7, transition:"background 0.15s" }}>
            {ttsGenerating ? (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {ttsProgress ? `Generating ${ttsProgress.done + 1} of ${ttsProgress.total}...` : "Starting..."}</>
            ) : withAudio.length > 0 ? (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>Regenerate All Voices ({aiLines.length})</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>Generate Voices for {aiLines.length} AI Line{aiLines.length !== 1 ? "s" : ""}</>
            )}
          </button>
          <div style={{ marginTop:5, fontSize:10, color:"#9ca3af", textAlign:"center" as const }}>
            ~{aiLines.reduce((s,l) => s+l.text.length, 0).toLocaleString()} 
          </div>
        </>
      )}
    </>
  );
}

// ─── Conversation Canvas ───────────────────────────────────────────────────────
function ConversationCanvas({ lines, title, description, onTitleChange, onDescChange, totalPoints, selectedLineIdx, onSelectLine }: {
  lines: Line[]; title: string; description: string;
  onTitleChange: (v: string) => void; onDescChange: (v: string) => void;
  totalPoints: number; selectedLineIdx: number | null; onSelectLine: (i: number) => void;
}) {
  return (
    <div style={{ background:"white", border:"1.5px solid #e5e7eb", borderRadius:14, padding:"20px 24px 24px", minHeight:400 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", marginBottom:16 }}>
        <span style={{ fontSize:13, color:"#6b7280", marginRight:8 }}>Points</span>
        <div style={{ padding:"4px 16px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:14, fontWeight:600, color:"#111", minWidth:48, textAlign:"center" as const }}>{totalPoints}</div>
      </div>
      <div style={{ marginBottom:20 }}>
        <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Conversation title..."
          style={{ border:"none", outline:"none", fontSize:20, fontWeight:700, color:"#111", width:"100%", background:"transparent", marginBottom:4 }}/>
        <input value={description} onChange={e => onDescChange(e.target.value)} placeholder="Practice description..."
          style={{ border:"none", outline:"none", fontSize:13, color:"#9ca3af", width:"100%", background:"transparent" }}/>
      </div>
      {lines.length === 0 && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", gap:12, border:"2px dashed #e5e7eb", borderRadius:12, background:"#fafafa" }}>
          <div style={{ width:44, height:44, borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div style={{ fontSize:14, fontWeight:600, color:"#374151", textAlign:"center" as const }}>No conversation lines yet</div>
          <div style={{ fontSize:13, color:"#9ca3af", textAlign:"center" as const }}>Add lines from the sidebar or use AI to generate a dialogue</div>
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {lines.map((line, i) => {
          const isStudent  = line.speaker === "Student";
          const isSelected = selectedLineIdx === i;
          return (
            <div key={line.lineId} onClick={() => onSelectLine(i)} style={{ cursor:"pointer" }}>
              {!isStudent && (
                <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:8 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"#f0fdf4", border:"2px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🤖</div>
                  <div style={{ maxWidth:"60%" }}>
                    <div style={{ background:isSelected?"#ecfdf5":"#f9fafb", border:`1.5px solid ${isSelected?"#22c55e":"#e5e7eb"}`, borderRadius:"4px 12px 12px 12px", padding:"10px 14px", fontSize:14, color:"#374151", lineHeight:1.7, transition:"all 0.15s", minHeight:44 }}>
                      {line.text || <span style={{ color:"#c4c4c4", fontStyle:"italic" }}>Empty line — click to edit in sidebar</span>}
                    </div>
                    {/* Show inline player if audio ready, otherwise just a play icon placeholder */}
                    {line.audioUrl
                      ? <InlineAudioPlayer url={line.audioUrl}/>
                      : line.text && (
                          <button style={{ marginTop:4, background:"none", border:"none", cursor:"pointer", color:"#d1d5db", padding:2, display:"flex", alignItems:"center", gap:4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
                            <span style={{ fontSize:10, color:"#d1d5db" }}>No audio yet</span>
                          </button>
                        )
                    }
                  </div>
                </div>
              )}
              {isStudent && (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ maxWidth:"65%" }}>
                      <div style={{ background:isSelected?"#ecfdf5":"#f9fafb", border:`1.5px solid ${isSelected?"#22c55e":"#e5e7eb"}`, borderRadius:"12px 4px 12px 12px", padding:"10px 14px", fontSize:14, color:"#374151", lineHeight:1.7, transition:"all 0.15s", minHeight:44 }}>
                        {line.text || <span style={{ color:"#c4c4c4", fontStyle:"italic" }}>Empty student line</span>}
                      </div>
                    </div>
                    <div style={{ background:"#22c55e", borderRadius:"50%", padding:"5px 9px", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>Student</div>
                  </div>
                  {line.vocabularyHelp.filter(v => v.word).length > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, maxWidth:"70%" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      <span style={{ fontSize:11, fontWeight:700, color:"#16a34a" }}>Vocabulary</span>
                      {line.vocabularyHelp.filter(v => v.word).map((v, vi) => (
                        <span key={vi} style={{ fontSize:11, color:"#374151" }}><strong>{v.word}</strong> : {v.definition}</span>
                      ))}
                    </div>
                  )}
                  {line.keyWords.length > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e" }}/>
                      <span style={{ fontSize:12, color:"#6b7280" }}>{line.keyWords.length} key word{line.keyWords.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Evaluation Panel ──────────────────────────────────────────────────────────
function EvaluationPanel({ weights, onChange, selectedLine }: {
  weights: ScoringWeights; onChange: (w: ScoringWeights) => void; selectedLine: Line | null;
}) {
  const total   = weights.pronunciation + weights.accuracy + weights.fluency + weights.completeness;
  const isOver  = total > 100;
  const isUnder = total < 100;
  const criteria: { key: keyof ScoringWeights; label: string; icon: React.ReactNode }[] = [
    { key:"pronunciation", label:"Pronunciation", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg> },
    { key:"accuracy",      label:"Accuracy",      icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
    { key:"fluency",       label:"Fluency",       icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
    { key:"completeness",  label:"Completeness",  icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg> },
  ];
  return (
    <div style={{ padding:"14px 16px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:16 }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:"#22c55e" }}/>
        <span style={{ fontSize:13, fontWeight:700, color:"#111" }}>Scoring Weights</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {criteria.map(c => (
          <div key={c.key}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, color:"#374151" }}>{c.icon}<span style={{ fontSize:13 }}>{c.label}</span></div>
              <span style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>{weights[c.key]}%</span>
            </div>
            <input type="range" min={0} max={100} value={weights[c.key]}
              onChange={e => onChange({ ...weights, [c.key]: +e.target.value })}
              style={{ width:"100%", accentColor:"#22c55e", cursor:"pointer" }}/>
          </div>
        ))}
      </div>
      <div style={{ marginTop:16, padding:"12px 14px", background:isOver||isUnder?"#fffbeb":"#f9fafb", border:`1px solid ${isOver||isUnder?"#fde68a":"#e5e7eb"}`, borderRadius:9 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>Total Weight</span>
          <span style={{ fontSize:14, fontWeight:700, color:isOver?"#ef4444":isUnder?"#f59e0b":"#22c55e" }}>{total}%</span>
        </div>
        {(isOver||isUnder) && <div style={{ fontSize:11, color:"#d97706", marginTop:4 }}>Weights should total 100%</div>}
        {!isOver&&!isUnder && <div style={{ fontSize:11, color:"#22c55e", marginTop:4 }}>✓ Balanced</div>}
      </div>
      <div style={{ height:1, background:"#f3f4f6", margin:"16px 0" }}/>
      <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:10 }}>Line-Specific</div>
      {selectedLine ? (
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:9, padding:"12px 14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#16a34a" }}>{selectedLine.speaker} Line</span>
          </div>
          {selectedLine.keyWords.length > 0 && (
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:11, color:"#6b7280", marginBottom:3 }}>Key words:</div>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4 }}>
                {selectedLine.keyWords.map((kw, i) => (
                  <span key={i} style={{ fontSize:11, fontWeight:600, background:"white", border:"1px solid #bbf7d0", color:"#16a34a", padding:"2px 7px", borderRadius:10 }}>{kw}</span>
                ))}
              </div>
            </div>
          )}
          {selectedLine.pronunciationFocus && <div style={{ fontSize:11, color:"#374151" }}><span style={{ fontWeight:600 }}>Pronunciation:</span> {selectedLine.pronunciationFocus}</div>}
          {!selectedLine.keyWords.length && !selectedLine.pronunciationFocus && <div style={{ fontSize:12, color:"#9ca3af" }}>Configure this line in the Line panel to add evaluation criteria.</div>}
        </div>
      ) : (
        <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:9, padding:"12px 14px" }}>
          <span style={{ fontSize:12, fontWeight:700, color:"#2563eb" }}>Per-Line Evaluation</span>
          <p style={{ fontSize:12, color:"#374151", lineHeight:1.6, marginTop:4 }}>Select a line in the Line panel to configure specific evaluation criteria, key words, and student hints for that line.</p>
        </div>
      )}
    </div>
  );
}

// ─── AI Message type ───────────────────────────────────────────────────────────
interface AIMessage {
  id:       string;
  role:     "user" | "ai";
  text:     string;
  pending?: { lines: AILine[]; logId: string };
}

// ─── AI Assistant Panel ────────────────────────────────────────────────────────
function AIAssistantPanel({ exerciseId, meta, lines, onAcceptLines }: {
  exerciseId:    string;
  meta:          ExerciseMeta;
  lines:         Line[];
  onAcceptLines: (aiLines: AILine[], logId: string) => void;
}) {
  const [messages,  setMessages]  = useState<AIMessage[]>([
    { id:uid(), role:"ai", text:"Hello! I'm your AI speaking assistant.\n\nI can generate full conversation dialogues with pronunciation hints, vocabulary help, and evaluation key words.\n\nTell me what scenario you'd like to practice, or use the dialogue builder below." },
  ]);
  const [input,     setInput]     = useState("");
  const [scenario,  setScenario]  = useState("");
  const [tone,      setTone]      = useState<"Casual"|"Formal">("Casual");
  const [lineCount, setLineCount] = useState<"4-6"|"8-10">("4-6");
  const [loading,   setLoading]   = useState(false);
  const scrollRef                 = useRef<HTMLDivElement>(null);
  const fileRef                   = useRef<HTMLInputElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const generate = async (prompt: string, documentText?: string) => {
    if (!prompt.trim() || loading) return;
    setInput("");
    setMessages(p => [...p, { id:uid(), role:"user", text:documentText ? `📄 Document uploaded — ${prompt}` : prompt }]);
    setLoading(true);
    try {
      const result = await generateSpeakingContent({
        exerciseId: exerciseId || "draft",
        userPrompt: prompt,
        documentText,
        exerciseMeta: { title:meta.title, description:meta.description, cefr:meta.cefr, tone, scenario },
        lineCount: lineCount === "4-6" ? 6 : 10,
        currentLines: summarizeLines(lines),
      });
      const { reasoning, suggestedLines, logId } = result;
      const studentLines = suggestedLines.filter(l => l.speaker === "Student");
      const summary = [
        reasoning,
        `\n✓ ${suggestedLines.length} lines generated (${studentLines.length} student turns)`,
        studentLines.filter(l => l.keyWords.length > 0).length > 0
          ? `✓ Key words on ${studentLines.filter(l => l.keyWords.length > 0).length} student line${studentLines.filter(l => l.keyWords.length > 0).length !== 1 ? "s" : ""}` : "",
        studentLines.filter(l => l.pronunciationFocus).length > 0
          ? `✓ Pronunciation focus on ${studentLines.filter(l => l.pronunciationFocus).length} line${studentLines.filter(l => l.pronunciationFocus).length !== 1 ? "s" : ""}` : "",
      ].filter(Boolean).join("\n");
      setMessages(p => [...p, { id:uid(), role:"ai", text:summary, pending:{ lines:suggestedLines, logId } }]);
    } catch (err: any) {
      setMessages(p => [...p, { id:uid(), role:"ai", text:`Error: ${err?.message ?? "Something went wrong."}` }]);
    } finally { setLoading(false); }
  };

  const send = (text?: string) => generate(text || input);

  const handleAccept = async (pending: NonNullable<AIMessage["pending"]>) => {
    onAcceptLines(pending.lines, pending.logId);
    await markSpeakingLogAccepted(pending.logId);
    setMessages(p => p.map(m => m.pending?.logId === pending.logId ? { ...m, pending:undefined } : m));
  };

  const handleDismiss = (logId: string) => {
    setMessages(p => p.map(m => m.pending?.logId === logId ? { ...m, pending:undefined } : m));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = ev => generate("Generate a speaking dialogue from this script/document.", ev.target?.result as string);
    reader.onerror = () => setMessages(p => [...p, { id:uid(), role:"ai", text:"Failed to read the file. Please try a .txt or .md file." }]);
    reader.readAsText(file);
  };

  const SCENARIOS = ["Ordering at a coffee shop", "Checking into a hotel", "Asking for directions"];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <input type="file" ref={fileRef} hidden accept=".txt,.md" onChange={handleFileUpload}/>
      <div style={{ padding:"8px 14px", borderBottom:"1px solid #f3f4f6", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e" }}/>
          <span style={{ fontSize:12, color:"#374151", fontWeight:500 }}>Gemini Flash Active</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:20, padding:"2px 10px" }}>
          <span style={{ fontSize:12 }}>😊</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#d97706" }}>Friendly</span>
        </div>
      </div>
      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map(msg => (
          <div key={msg.id}>
            <div style={{ display:"flex", gap:7, justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
              {msg.role==="ai" && <div style={{ width:24, height:24, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>}
              <div style={{ background:msg.role==="user"?"#22c55e":"#f3f4f6", color:msg.role==="user"?"white":"#374151", padding:"8px 11px", borderRadius:msg.role==="user"?"13px 13px 2px 13px":"13px 13px 13px 2px", fontSize:12, lineHeight:1.6, maxWidth:"80%", whiteSpace:"pre-line", order:msg.role==="user"?1:2 }}>{msg.text}</div>
              {msg.role==="user" && <div style={{ width:24, height:24, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2, order:2 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>}
            </div>
            {msg.role==="ai" && !msg.pending && (
              <div style={{ display:"flex", gap:5, marginTop:4, marginLeft:31 }}>
                {["👍","👎","⧉","↺"].map(icon => <button key={icon} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"#9ca3af", padding:1 }}>{icon}</button>)}
              </div>
            )}
            {msg.role==="ai" && msg.pending && (
              <div style={{ marginLeft:31, marginTop:8 }}>
                <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:9, padding:"10px 12px", marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:"0.05em", marginBottom:8 }}>{msg.pending.lines.length} conversation lines ready</div>
                  {msg.pending.lines.slice(0,5).map((l,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:6, padding:"4px 0", borderBottom:i<Math.min(msg.pending!.lines.length,5)-1?"1px solid #f3f4f6":"none" }}>
                      <span style={{ fontSize:10, fontWeight:700, color:l.speaker==="Student"?"#22c55e":"#9ca3af", width:45, flexShrink:0, marginTop:1 }}>{l.speaker}</span>
                      <span style={{ fontSize:11, color:"#374151", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.text}</span>
                    </div>
                  ))}
                  {msg.pending.lines.length > 5 && <div style={{ fontSize:10, color:"#9ca3af", paddingTop:5 }}>+{msg.pending.lines.length-5} more lines...</div>}
                  <div style={{ display:"flex", gap:8, marginTop:8, paddingTop:6, borderTop:"1px solid #f3f4f6" }}>
                    {msg.pending.lines.filter(l=>l.keyWords.length>0).length>0 && <span style={{ fontSize:10, color:"#22c55e", fontWeight:600 }}>🔑 {msg.pending.lines.filter(l=>l.keyWords.length>0).length} key words</span>}
                    {msg.pending.lines.filter(l=>l.pronunciationFocus).length>0 && <span style={{ fontSize:10, color:"#2563eb", fontWeight:600 }}>🎙 {msg.pending.lines.filter(l=>l.pronunciationFocus).length} pronunciation tips</span>}
                    {msg.pending.lines.filter(l=>l.vocabularyHelp.length>0).length>0 && <span style={{ fontSize:10, color:"#d97706", fontWeight:600 }}>📖 {msg.pending.lines.filter(l=>l.vocabularyHelp.length>0).length} vocab cards</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:7 }}>
                  <button onClick={() => handleAccept(msg.pending!)}
                    style={{ flex:1, padding:"8px 0", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Add to Conversation
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
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
            <div style={{ background:"#f3f4f6", padding:"8px 11px", borderRadius:"13px 13px 13px 2px", fontSize:12, color:"#9ca3af" }}>Generating dialogue...</div>
          </div>
        )}
      </div>
      <div style={{ padding:"8px 12px", borderTop:"1px solid #f3f4f6", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
        <button onClick={() => fileRef.current?.click()} title="Upload script (.txt or .md)"
          style={{ width:26, height:26, borderRadius:6, border:"1px solid #e5e7eb", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        <input value={input} disabled={loading} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Describe a speaking scenario..."
          style={{ flex:1, border:"none", outline:"none", fontSize:12, color:"#374151", background:"transparent" }}/>
        <button onClick={() => send()} disabled={loading||!input.trim()}
          style={{ width:26, height:26, borderRadius:"50%", background:loading?"#d1d5db":"#22c55e", border:"none", cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div style={{ padding:"10px 14px", borderTop:"1px solid #f3f4f6", flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#374151", marginBottom:6 }}>Quick dialogue builder</div>
        <div onClick={() => fileRef.current?.click()}
          style={{ border:"2px dashed #e5e7eb", borderRadius:10, padding:"8px 10px", display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:8 }}
          onMouseOver={e => (e.currentTarget as HTMLElement).style.borderColor="#22c55e"}
          onMouseOut={e  => (e.currentTarget as HTMLElement).style.borderColor="#e5e7eb"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p style={{ fontSize:11, color:"#6b7280", margin:0 }}><span style={{ color:"#22c55e", fontWeight:600 }}>Upload a script</span> to build dialogue automatically</p>
        </div>
        <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", marginBottom:4 }}>Scenario / Context</div>
        <textarea rows={2} value={scenario} onChange={e => setScenario(e.target.value)}
          style={{ ...inp, resize:"none", lineHeight:1.6, fontSize:12, padding:"7px 9px", marginBottom:6 }} placeholder="Describe the conversation scenario..."/>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const, marginBottom:8 }}>
          {SCENARIOS.map(s => (
            <button key={s} onClick={() => setScenario(s)}
              style={{ padding:"4px 9px", border:`1px solid ${scenario===s?"#22c55e":"#e5e7eb"}`, borderRadius:14, fontSize:11, fontWeight:500, color:scenario===s?"#22c55e":"#6b7280", background:scenario===s?"#f0fdf4":"white", cursor:"pointer" }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", marginBottom:4 }}>Tone</div>
            <div style={{ display:"flex", gap:4 }}>
              {(["Casual","Formal"] as const).map(t => (
                <button key={t} onClick={() => setTone(t)}
                  style={{ flex:1, padding:"5px 0", border:`1.5px solid ${tone===t?"#22c55e":"#e5e7eb"}`, borderRadius:7, fontSize:11, fontWeight:600, color:tone===t?"#22c55e":"#6b7280", background:tone===t?"#f0fdf4":"white", cursor:"pointer" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", marginBottom:4 }}>Length</div>
            <div style={{ display:"flex", gap:4 }}>
              {(["4-6","8-10"] as const).map(l => (
                <button key={l} onClick={() => setLineCount(l)}
                  style={{ flex:1, padding:"5px 0", border:`1.5px solid ${lineCount===l?"#22c55e":"#e5e7eb"}`, borderRadius:7, fontSize:11, fontWeight:600, color:lineCount===l?"#22c55e":"#6b7280", background:lineCount===l?"#f0fdf4":"white", cursor:"pointer" }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => generate(scenario ? `Generate a ${lineCount} line ${tone} dialogue about: ${scenario}` : `Generate a ${lineCount} line ${tone} conversation dialogue`)}
          disabled={loading}
          style={{ width:"100%", padding:"10px 0", border:"none", borderRadius:9, background:loading?"#d1d5db":"#22c55e", color:"white", fontSize:13, fontWeight:700, cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          {loading
            ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Generating...</>
            : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Generate Dialogue</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function SpeakingCreate() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();
  const stateData = location.state as any;
  const courseId  = stateData?.courseId || stateData?.courseInfo?.courseId || "";
  const sectionId = stateData?.sectionId || "";

  const [leftTab,      setLeftTab]      = useState<"settings"|"line">("settings");
  const [rightTab,     setRightTab]     = useState<"ai"|"evaluation">("ai");
  const [selectedLine, setSelectedLine] = useState<number|null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saveStatus,   setSaveStatus]   = useState<"saved"|"unsaved"|"saving">("unsaved");
  const [published,    setPublished]    = useState(false);
  const [studentView,  setStudentView]  = useState(false);
  const [lines,        setLines]        = useState<Line[]>([]);
  const [weights,      setWeights]      = useState<ScoringWeights>({ pronunciation:25, accuracy:25, fluency:25, completeness:23 });
  const [audioFile,    setAudioFile]    = useState<File|null>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  // TTS state
  const [globalVoice,   setGlobalVoice]   = useState(DEFAULT_VOICE);
  const [speechRate,    setSpeechRate]    = useState(1.0);
  const [speechPitch,   setSpeechPitch]   = useState(0);
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const [ttsProgress,   setTtsProgress]   = useState<{ done: number; total: number } | null>(null);
  const [ttsResults,    setTtsResults]    = useState<TTSLineResult[]>([]);

  const [meta, setMeta] = useState<ExerciseMeta>({
    title:"", description:"", aiNativeVoice:DEFAULT_VOICE, cefr:"B1",
    pointsPerLine:1, passingScore:70, allowedAttempts:"1 Attempt",
    xpReward:50, pointsReward:10, aiGenerated:false,
  });

  // ── Load existing data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!courseId || !exerciseId || exerciseId === "draft") return;

    const loadData = async () => {
      try {
        // 1. Fetch Metadata
        const exerciseRef = doc(db, "courses", courseId, "exercises", exerciseId);
        const exerciseSnap = await getDoc(exerciseRef);
        
        if (exerciseSnap.exists()) {
          const data = exerciseSnap.data();
          const config = data.speakingConfig || {};
          setMeta({
            title:       data.title || "",
            description: data.description || "",
            aiNativeVoice: config.aiNativeVoice || DEFAULT_VOICE,
            cefr:        config.cefr || "B1",
            pointsPerLine: config.pointsPerLine || 1,
            passingScore:  data.metadata?.passingScore || 70,
            allowedAttempts: config.allowedAttempts || "1 Attempt",
            xpReward:      data.metadata?.xpReward || 50,
            pointsReward:  data.metadata?.pointsReward || 10,
            aiGenerated:   data.aiGenerated || false,
          });
          if (config.scoringWeights) setWeights(config.scoringWeights);
          if (config.aiNativeVoice) setGlobalVoice(config.aiNativeVoice);
        }

        // 2. Fetch Lines
        const linesRef = collection(db, "courses", courseId, "exercises", exerciseId, "lines");
        const linesSnap = await getDocs(query(linesRef, orderBy("order", "asc")));
        
        if (!linesSnap.empty) {
          const loadedLines: Line[] = linesSnap.docs.map(docSnap => {
            const d = docSnap.data();
            return {
              lineId:             d.lineId || docSnap.id,
              order:              d.order ?? 0,
              speaker:            d.speaker || "AI",
              text:               d.text || "",
              audioUrl:           d.audioUrl || "",
              voiceName:          d.voiceName || DEFAULT_VOICE,
              pronunciationFocus: d.pronunciationFocus || "",
              vocabularyHelp:     d.vocabularyHelp || [],
              keyWords:           d.keyWords || [],
              studentHint:        d.studentHint || "",
              configured:         d.speaker === "Student" && (d.keyWords?.length > 0 || !!d.pronunciationFocus),
            };
          });
          setLines(loadedLines);
          setSaveStatus("saved");
        }
      } catch (err) {
        console.error("Error loading speaking exercise:", err);
      }
    };

    loadData();
  }, [courseId, exerciseId]);

  const totalPoints = lines.filter(l => l.speaker === "Student").length * (meta.pointsPerLine || 1);

  const addLine = (speaker: "AI"|"Student" = "AI") => {
    const newLine = mkLine(lines.length, speaker);
    // Apply current global voice to new AI lines
    if (speaker === "AI") newLine.voiceName = globalVoice;
    setLines(p => [...p, newLine]);
    setSelectedLine(lines.length);
    setLeftTab("line");
    setSaveStatus("unsaved");
  };

  const updateLine = (idx: number, l: Line) => {
    const ls = [...lines]; ls[idx] = l; setLines(ls);
    setSaveStatus("unsaved");
  };

  const deleteLine = (idx: number) => {
    setLines(lines.filter((_,i) => i !== idx).map((l,i) => ({ ...l, order:i })));
    if (selectedLine !== null) {
      if (selectedLine >= idx && selectedLine > 0) setSelectedLine(selectedLine - 1);
      else if (lines.length === 1) setSelectedLine(null);
    }
    setSaveStatus("unsaved");
  };

  const handleAcceptLines = (aiLines: AILine[], logId: string) => {
    const newLines: Line[] = aiLines.map((al, i) => ({
      lineId:             uid(),
      order:              lines.length + i,
      speaker:            al.speaker,
      text:               al.text,
      audioUrl:           "",
      voiceName:          al.speaker === "AI" ? globalVoice : DEFAULT_VOICE,
      pronunciationFocus: al.pronunciationFocus,
      vocabularyHelp:     al.vocabularyHelp,
      keyWords:           al.keyWords,
      studentHint:        al.studentHint,
      configured:         al.speaker === "Student" && (al.keyWords.length > 0 || !!al.pronunciationFocus),
    }));
    setLines(prev => [...prev, ...newLines]);
    setSelectedLine(lines.length);
    setLeftTab("line");
    setSaveStatus("unsaved");
  };

  // ── Batch TTS ─────────────────────────────────────────────────────────────────
  const handleBatchGenerateTTS = async () => {
    const aiLines = prepareAILinesForTTS(lines, globalVoice);
    if (aiLines.length === 0) { alert("No AI lines with text found. Add text to AI lines first."); return; }
    setTtsGenerating(true);
    setTtsProgress({ done:0, total:aiLines.length });
    setTtsResults([]);
    try {
      const result = await batchGenerateTTS({
        courseId,
        exerciseId: exerciseId || "draft",
        lines:      aiLines,
        rate:       speechRate,
        pitch:      speechPitch,
      });
      // Apply audio URLs back to lines
      setLines(prev => prev.map(l => {
        const match = result.results.find(r => r.lineId === l.lineId);
        return match?.success ? { ...l, audioUrl: match.audioUrl } : l;
      }));
      setTtsResults(result.results);
      setTtsProgress({ done: result.successCount, total: aiLines.length });
      setSaveStatus("unsaved");
    } catch (err: any) {
      alert(`TTS failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setTtsGenerating(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async (andPublish = false) => {
    if (!courseId || !exerciseId) { alert("No course ID or exercise ID found."); return; }
    setSaving(true); setSaveStatus("saving");
    try {
      const exerciseRef = doc(db, "courses", courseId, "exercises", exerciseId);

      const cleanMeta = Object.fromEntries(Object.entries({
        title:       meta.title || "Speaking Practice",
        description: meta.description,
        aiGenerated: meta.aiGenerated,
      }).filter(([_, v]) => v !== undefined));

      const cleanMetadata = Object.fromEntries(Object.entries({
        questionCount: lines.filter(l => l.speaker === "Student").length,
        duration:0, xpReward:meta.xpReward, pointsReward:meta.pointsReward, passingScore:meta.passingScore,
      }).filter(([_, v]) => v !== undefined));

      const cleanConfig = Object.fromEntries(Object.entries({
        aiNativeVoice:meta.aiNativeVoice, cefr:meta.cefr,
        pointsPerLine:meta.pointsPerLine, allowedAttempts:meta.allowedAttempts,
        scoringWeights:weights,
      }).filter(([_, v]) => v !== undefined));

      await setDoc(exerciseRef, {
        exerciseId, sectionId,
        ...cleanMeta,
        type:        "Speaking",
        metadata: cleanMetadata,
        order:0,
        createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
        speakingConfig: cleanConfig,
      });
      if (lines.length > 0) {
        const batch = writeBatch(db);
        lines.forEach((line, idx) => {
          const lineRef = doc(db, "courses", courseId, "exercises", exerciseId, "lines", line.lineId);
          const rawLine = {
            lineId:line.lineId, order:idx, speaker:line.speaker, text:line.text,
            audioUrl:line.audioUrl, voiceName:line.voiceName,
            pronunciationFocus:line.pronunciationFocus, vocabularyHelp:line.vocabularyHelp,
            keyWords:line.keyWords, studentHint:line.studentHint,
          };
          const cleanLine = Object.fromEntries(Object.entries(rawLine).filter(([_, v]) => v !== undefined));
          batch.set(lineRef, cleanLine);
        });
        await batch.commit();
      }
      if (stateData?.courseInfo) {
        const cs: Section[] = stateData.courseInfo.sections || [];
        const us = cs.map((s: Section) => {
          const sid = (s as any).id || (s as any).sectionId;
          if (sid !== sectionId) return s;
          const items = s.items || [];
          const ei    = items.findIndex((i: SectionItem) => i.id === exerciseId);
          const ex: ExerciseItem = { id:exerciseId, kind:"exercise", number:ei>=0?items[ei].number:items.filter((i:SectionItem)=>i.kind==="exercise").length+1, title:meta.title||"Speaking Practice", type:"Speaking", duration:0, questionCount:0 };
          const ni = [...items]; ei >= 0 ? (ni[ei] = ex) : ni.push(ex);
          return { ...s, items:ni };
        });
        await updateSections(courseId, us);
        const tl = us.reduce((a:number,s:Section) => a+s.items.filter((i:SectionItem)=>i.kind==="lesson").length, 0);
        const te = us.reduce((a:number,s:Section) => a+s.items.filter((i:SectionItem)=>i.kind==="exercise").length, 0);
        await updateCourse(courseId, { totalLessons:tl, totalExercises:te, sections:us });
        stateData.courseInfo.sections = us;
      }
      setSaveStatus("saved");
      if (andPublish) setPublished(true);
      setTimeout(() => navigate(-1), 600);
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save. Please try again.");
      setSaveStatus("unsaved");
    } finally { setSaving(false); }
  };

  const selectedLineObj = selectedLine !== null ? lines[selectedLine] ?? null : null;
  const CEFR     = ["A1","A2","B1","B2","C1","C2"];
  const ATTEMPTS = ["1 Attempt","2 Attempts","3 Attempts","Unlimited"];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;overflow:hidden;font-family:'DM Sans',sans-serif}
        input,select,textarea,button{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#f5f6fa" }}>

        {/* Top Bar */}
        <div style={{ height:52, background:"white", borderBottom:"1px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", flexShrink:0, zIndex:50 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={() => navigate(-1)} style={{ background:"none", border:"none", cursor:"pointer", color:"#6b7280", display:"flex", alignItems:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize:13, color:"#9ca3af" }}>{stateData?.courseTitle || stateData?.courseInfo?.title || "Business English B2"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ fontSize:13, fontWeight:700, color:"#111" }}>{meta.title || "Speaking Practice"}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:13, color:"#374151" }}>Student View</span>
            <button onClick={() => setStudentView(p => !p)}
              style={{ width:42, height:24, borderRadius:12, border:"none", background:studentView?"#22c55e":"#d1d5db", position:"relative", cursor:"pointer", transition:"background 0.2s" }}>
              <div style={{ width:18, height:18, borderRadius:"50%", background:"white", position:"absolute", top:3, left:studentView?21:3, transition:"left 0.2s" }}/>
            </button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {saveStatus==="saved" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#22c55e", fontWeight:500 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Saved
              </div>
            )}
            <button onClick={() => handleSave(false)} disabled={saving}
              style={{ padding:"7px 16px", border:"1px solid #e5e7eb", borderRadius:8, background:"white", fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>
              {saving?"Saving...":"Save Draft"}
            </button>
            <button onClick={() => handleSave(true)} disabled={saving}
              style={{ padding:"7px 18px", border:"none", borderRadius:8, background:"#22c55e", fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>
              {published?"Published ✓":"Publish"}
            </button>
            <div style={{ width:32, height:32, borderRadius:"50%", background:"#22c55e", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:13, fontWeight:700 }}>
              {user?.displayName?.[0]||"T"}
            </div>
          </div>
        </div>

        {/* 3-column body */}
        <div style={{ flex:1, display:"flex", minHeight:0 }}>

          {/* LEFT sidebar */}
          <div style={{ width:250, background:"white", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column", flexShrink:0, minHeight:0 }}>
            <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
              {(["Settings","Line"] as const).map(t => {
                const active = t==="Settings" ? leftTab==="settings" : leftTab==="line";
                return (
                  <button key={t} onClick={() => setLeftTab(t==="Settings"?"settings":"line")}
                    style={{ flex:1, padding:"13px 0", background:"none", border:"none", borderBottom:`2px solid ${active?"#22c55e":"transparent"}`, fontSize:13, fontWeight:600, color:active?"#22c55e":"#9ca3af", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"color 0.15s,border-color 0.15s" }}>
                    {t==="Settings"
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                    {t}
                  </button>
                );
              })}
            </div>

            {/* Settings tab */}
            {leftTab==="settings" && (
              <div style={{ flex:1, overflowY:"auto", padding:"14px 16px 40px" }}>
                {/* Voice Settings Panel replaces old AI Native Voice text input */}
                <VoiceSettingsPanel
                  globalVoice={globalVoice}   setGlobalVoice={setGlobalVoice}
                  speechRate={speechRate}      setSpeechRate={setSpeechRate}
                  speechPitch={speechPitch}    setSpeechPitch={setSpeechPitch}
                  lines={lines}               setLines={setLines}
                  ttsGenerating={ttsGenerating}
                  ttsProgress={ttsProgress}
                  ttsResults={ttsResults}
                  onBatchGenerate={handleBatchGenerateTTS}/>

                <div style={sec}>CEFR</div>
                <div style={{ position:"relative" }}>
                  <select value={meta.cefr} onChange={e => setMeta({...meta,cefr:e.target.value})} style={{ ...inp, appearance:"none", paddingRight:28, cursor:"pointer" }}>
                    {CEFR.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div style={sec}>Exercise Title</div>
                <input style={inp} value={meta.title} onChange={e => setMeta({...meta,title:e.target.value})} placeholder="Speaking Practice"/>
                <div style={sec}>Description</div>
                <textarea rows={2} style={{ ...inp, resize:"none", lineHeight:1.6 }} value={meta.description} onChange={e => setMeta({...meta,description:e.target.value})} placeholder="Practice description..."/>
                <div style={{ ...sec, marginTop:20 }}>Global Scoring</div>
                <label style={lbl}>Points per line</label>
                <input type="number" min={0} style={{ ...inp, marginBottom:10 }} value={meta.pointsPerLine} onChange={e => setMeta({...meta,pointsPerLine:+e.target.value})}/>
                <label style={lbl}>Passing Score</label>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:"#9ca3af" }}>0%</span>
                  <span style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>{meta.passingScore}%</span>
                  <span style={{ fontSize:12, color:"#9ca3af" }}>100%</span>
                </div>
                <input type="range" min={0} max={100} value={meta.passingScore} onChange={e => setMeta({...meta,passingScore:+e.target.value})} style={{ width:"100%", accentColor:"#22c55e", marginBottom:12 }}/>
                <label style={lbl}>Allowed Attempts</label>
                <div style={{ position:"relative", marginBottom:12 }}>
                  <select value={meta.allowedAttempts} onChange={e => setMeta({...meta,allowedAttempts:e.target.value})} style={{ ...inp, appearance:"none", paddingRight:28, cursor:"pointer" }}>
                    {ATTEMPTS.map(a => <option key={a}>{a}</option>)}
                  </select>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                  <div><label style={lbl}>XP Reward</label><input type="number" min={0} style={inp} value={meta.xpReward} onChange={e => setMeta({...meta,xpReward:+e.target.value})}/></div>
                  <div><label style={lbl}>Points</label><input type="number" min={0} style={inp} value={meta.pointsReward} onChange={e => setMeta({...meta,pointsReward:+e.target.value})}/></div>
                </div>
                <div style={sec}>Audio Input</div>
                <div onClick={() => audioRef.current?.click()} style={{ border:"2px dashed #e5e7eb", borderRadius:9, padding:"14px", display:"flex", flexDirection:"column", alignItems:"center", gap:5, cursor:"pointer", background:"#fafafa", marginBottom:10 }}>
                  <input type="file" ref={audioRef} hidden accept="audio/*" onChange={e => { const f=e.target.files?.[0]; if(f)setAudioFile(f); }}/>
                  {audioFile ? (
                    <><div style={{ fontSize:18 }}>🎵</div><div style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{audioFile.name}</div></>
                  ) : (
                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      <span style={{ fontSize:12, color:"#22c55e", fontWeight:600 }}>Upload an audio file</span>
                      <span style={{ fontSize:10, color:"#9ca3af" }}>mp3...</span></>
                  )}
                </div>
                <button onClick={() => addLine("AI")} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 0", border:"1px solid #e5e7eb", borderRadius:8, background:"white", fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add
                </button>
              </div>
            )}

            {/* Line tab */}
            {leftTab==="line" && (
              <>
                <div style={{ flex:1, overflowY:"auto", padding:"10px 10px 0", minHeight:0 }}>
                  {lines.length===0 && (
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 16px", gap:8 }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <div style={{ fontSize:12, color:"#9ca3af", textAlign:"center" as const }}>No lines yet. Add lines or generate a dialogue with AI.</div>
                    </div>
                  )}
                  {lines.map((line, i) => (
                    <LineCard key={line.lineId} line={line} index={i}
                      isSelected={selectedLine===i}
                      onSelect={() => setSelectedLine(i)}
                      onChange={nl => updateLine(i, nl)}
                      onDelete={() => deleteLine(i)}/>
                  ))}
                </div>
                <div style={{ padding:"10px", borderTop:"1px solid #f3f4f6", flexShrink:0, display:"flex", gap:6 }}>
                  <button onClick={() => addLine("AI")}
                    style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"8px 0", border:"1.5px dashed #e5e7eb", borderRadius:8, background:"none", fontSize:12, fontWeight:600, color:"#9ca3af", cursor:"pointer" }}
                    onMouseOver={e => (e.currentTarget as HTMLButtonElement).style.borderColor="#9ca3af"}
                    onMouseOut={e  => (e.currentTarget as HTMLButtonElement).style.borderColor="#e5e7eb"}>
                    AI Line
                  </button>
                  <button onClick={() => addLine("Student")}
                    style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"8px 0", border:"1.5px dashed #22c55e", borderRadius:8, background:"none", fontSize:12, fontWeight:700, color:"#22c55e", cursor:"pointer" }}>
                    + Add Line
                  </button>
                </div>
              </>
            )}
          </div>

          {/* CENTER canvas */}
          <div style={{ flex:1, overflow:"auto", minHeight:0, padding:"24px 28px 60px" }}>
            <ConversationCanvas
              lines={lines} title={meta.title} description={meta.description}
              onTitleChange={v => setMeta({...meta,title:v})}
              onDescChange={v => setMeta({...meta,description:v})}
              totalPoints={totalPoints}
              selectedLineIdx={selectedLine}
              onSelectLine={i => { setSelectedLine(i); setLeftTab("line"); }}/>
          </div>

          {/* RIGHT panel */}
          <div style={{ width:290, background:"white", borderLeft:"1px solid #e5e7eb", display:"flex", flexDirection:"column", flexShrink:0, minHeight:0 }}>
            <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", flexShrink:0, padding:"0 4px" }}>
              {(["AI Assistant","Evaluation"] as const).map(t => {
                const active = t==="AI Assistant" ? rightTab==="ai" : rightTab==="evaluation";
                return (
                  <button key={t} onClick={() => setRightTab(t==="AI Assistant"?"ai":"evaluation")}
                    style={{ flex:1, padding:"13px 0", background:"none", border:"none", borderBottom:`2px solid ${active?"#22c55e":"transparent"}`, fontSize:12, fontWeight:600, color:active?"#22c55e":"#9ca3af", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5, transition:"color 0.15s,border-color 0.15s" }}>
                    {t==="AI Assistant"
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
                    {t}
                  </button>
                );
              })}
            </div>
            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>
              {rightTab==="ai" ? (
                <AIAssistantPanel
                  exerciseId={exerciseId||stateData?.exerciseId||"draft"}
                  meta={meta} lines={lines}
                  onAcceptLines={handleAcceptLines}/>
              ) : (
                <div style={{ flex:1, overflowY:"auto" }}>
                  <EvaluationPanel weights={weights} onChange={setWeights} selectedLine={selectedLineObj}/>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}