import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebase";
import {
  getLesson, getBlocks, saveLesson, saveBlocks,
  defaultBlockContent, blockToHtml,
  type LessonBlock, type BlockType,
  type HeadingContent, type TextContent, type AudioContent,
  type ImageContent, type KeyTermsContent, type FormulaContent,
  type FileContent, type KeyTerm, type FormulaStep,
} from "../models/lessonModel";
import {
  updateCourse, updateSections,
  type Section, type LessonItem, type SectionItem,
} from "../models/courseModel";
import { uploadFile } from "../models/storageModel";
import { useAuth } from "../auth/AuthContext";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Block extends LessonBlock {}
type RightPanel = "ai" | "properties";
type LeftTab    = "settings" | "content";

interface TextStyle {
  fontFamily:    string;
  fontWeight:    string;
  fontSize:      number;
  color:         string;
  background:    string;
  align:         "left"|"center"|"right"|"justify";
  lineHeight:    number;
  letterSpacing: number;
  bold:          boolean;
  italic:        boolean;
  underline:     boolean;
  strikethrough: boolean;
}

const DEFAULT_HEADING_STYLE: TextStyle = {
  fontFamily:"DM Sans", fontWeight:"700", fontSize:22,
  color:"#111827", background:"transparent",
  align:"left", lineHeight:1.3, letterSpacing:0,
  bold:true, italic:false, underline:false, strikethrough:false,
};
const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily:"DM Sans", fontWeight:"400", fontSize:15,
  color:"#374151", background:"transparent",
  align:"left", lineHeight:1.75, letterSpacing:0,
  bold:false, italic:false, underline:false, strikethrough:false,
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function buildHeadingHtml(text: string, level: "h1"|"h2"|"h3", s: TextStyle): string {
  const dec = [s.underline&&"underline", s.strikethrough&&"line-through"].filter(Boolean).join(" ") || "none";
  return `<${level} style="font-family:'${s.fontFamily}',sans-serif;font-size:${s.fontSize}px;font-weight:${s.bold?700:+s.fontWeight};color:${s.color};text-align:${s.align};line-height:${s.lineHeight};letter-spacing:${s.letterSpacing}em;font-style:${s.italic?"italic":"normal"};text-decoration:${dec};margin:0 0 4px 0;">${esc(text)}</${level}>`;
}

function buildBodyHtml(text: string, boxed: boolean, s: TextStyle): string {
  const dec = [s.underline&&"underline", s.strikethrough&&"line-through"].filter(Boolean).join(" ") || "none";
  const bg  = s.background !== "transparent" ? `background-color:${s.background};` : "";
  const pStyle = `font-family:'${s.fontFamily}',sans-serif;font-size:${s.fontSize}px;font-weight:${+s.fontWeight};color:${s.color};text-align:${s.align};line-height:${s.lineHeight};letter-spacing:${s.letterSpacing}em;font-style:${s.italic?"italic":"normal"};text-decoration:${dec};${bg}margin:0 0 6px 0;`;
  const inner = text.split("\n").map(l => l.trim()==="" ? "<br />" : `<p style="${pStyle}">${esc(l)}</p>`).join("\n");
  if (!boxed) return inner;
  return `<div style="border:1.5px solid #22c55e;border-radius:10px;padding:16px 20px;">\n${inner}\n</div>`;
}

interface LessonMeta {
  title:string; description:string; type:string; level:string;
  duration:number; order:number; thumbnail:string;
  targetLanguage:string; nativeLanguage:string; objectives:string;
  tags:string[]; autoSave:boolean; showTranslations:boolean; enableAudio:boolean;
  metadata:{hasVideo:boolean; hasAudio:boolean};
}

const uid = () => Math.random().toString(36).slice(2, 9);
const mkBlock = (type: BlockType): Block => ({ id:uid(), type, order:0, content:defaultBlockContent(type), aiGenerated:false });

// ─── Block palette definitions ─────────────────────────────────────────────────
const BLOCK_DEFS: { type:BlockType; label:string; sub:string }[] = [
  { type:"heading",  label:"Heading",      sub:"H1, H2, H3 titles" },
  { type:"text",     label:"Text Block",   sub:"Paragraphs & rich text" },
  { type:"audio",    label:"Audio Player", sub:"MP3 with controls" },
  { type:"image",    label:"Image",        sub:"Image for visualization" },
  { type:"keyTerms", label:"Key Terms",    sub:"Vocabulary definitions" },
  { type:"formula",  label:"Formula",      sub:"Step-by-step structure" },
  { type:"file",     label:"File",         sub:"Downloadable document" },
];

const BLOCK_ICONS: Record<string, React.ReactNode> = {
  heading:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M18 8v8"/></svg>,
  text:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="15" y2="14"/></svg>,
  audio:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  image:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  keyTerms: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M4 6h16M4 10h16M4 14h10"/></svg>,
  formula:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>,
  file:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
};

// Module-level DnD state
let g_dragType:      "palette"|"canvas" = "palette";
let g_dragBlockType: BlockType          = "text";
let g_dragCanvasIdx: number             = -1;
let g_paletteDragIdx:number             = -1;

const stripHtml = (html: string): string =>
  (html || "").replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"');

const getStyle = (content: any, defaults: TextStyle): TextStyle =>
  (content._style as TextStyle) ?? defaults;

// ─── Block Renderers ───────────────────────────────────────────────────────────
function HeadingBlock({ content, onUpdate }: { content:HeadingContent; onUpdate:(d:any)=>void }) {
  const level = (content.text.match(/^<(h[1-3])/)?.[1] ?? (content as any)._level ?? "h2") as "h1"|"h2"|"h3";
  const s     = getStyle(content, { ...DEFAULT_HEADING_STYLE, fontSize: {h1:28,h2:22,h3:17}[level]||22 });
  const plain = stripHtml(content.text);
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
      <select value={level} onChange={e => {
        const lv = e.target.value as "h1"|"h2"|"h3";
        const ns = { ...s, fontSize: {h1:28,h2:22,h3:17}[lv] };
        onUpdate({ ...content, text:buildHeadingHtml(plain,lv,ns), _level:lv, _style:ns });
      }} style={{ fontSize:11, fontWeight:700, color:"#9ca3af", border:"1px solid #e5e7eb", borderRadius:4, padding:"1px 4px", background:"white", cursor:"pointer", flexShrink:0 }}>
        <option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option>
      </select>
      <div contentEditable suppressContentEditableWarning
        onBlur={e => onUpdate({ ...content, text:buildHeadingHtml(e.currentTarget.innerText,level,s), _level:level, _style:s })}
        style={{ fontSize:s.fontSize, fontFamily:`'${s.fontFamily}',sans-serif`, fontWeight:s.bold?700:+s.fontWeight, fontStyle:s.italic?"italic":"normal", textDecoration:[s.underline&&"underline",s.strikethrough&&"line-through"].filter(Boolean).join(" ")||"none", color:s.color, textAlign:s.align, letterSpacing:`${s.letterSpacing}em`, lineHeight:s.lineHeight, outline:"none", flex:1 }}>
        {plain}
      </div>
    </div>
  );
}

function TextBlock({ content, onUpdate }: { content:TextContent; onUpdate:(d:any)=>void }) {
  const isBoxed = (content as any)._boxed ?? content.text.includes("border:1.5px solid #22c55e");
  const s       = getStyle(content, DEFAULT_TEXT_STYLE);
  const plain   = stripHtml(content.text);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
        <button onClick={() => onUpdate({ ...content, text:buildBodyHtml(plain,!isBoxed,s), _boxed:!isBoxed, _style:s })}
          style={{ fontSize:10, fontWeight:600, color:isBoxed?"#22c55e":"#9ca3af", background:isBoxed?"#f0fdf4":"#f9fafb", border:`1px solid ${isBoxed?"#bbf7d0":"#e5e7eb"}`, borderRadius:4, padding:"2px 7px", cursor:"pointer" }}>
          {isBoxed ? "Boxed ✓" : "Box"}
        </button>
      </div>
      <div contentEditable suppressContentEditableWarning
        onBlur={e => onUpdate({ ...content, text:buildBodyHtml(e.currentTarget.innerText,isBoxed,s), _boxed:isBoxed, _style:s })}
        style={{ fontFamily:`'${s.fontFamily}',sans-serif`, fontSize:s.fontSize, fontWeight:+s.fontWeight, fontStyle:s.italic?"italic":"normal", textDecoration:[s.underline&&"underline",s.strikethrough&&"line-through"].filter(Boolean).join(" ")||"none", color:s.color, textAlign:s.align, letterSpacing:`${s.letterSpacing}em`, lineHeight:s.lineHeight, outline:"none", whiteSpace:"pre-wrap", minHeight:24, ...(isBoxed ? { border:"1.5px solid #22c55e", borderRadius:10, padding:"16px 20px" } : {}) }}>
        {plain}
      </div>
    </div>
  );
}

function AudioBlock({ content, onUpdate }: { content:AudioContent; onUpdate:(d:AudioContent)=>void }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentDuration, setCurrentDuration] = useState(content.duration || 0);
  const audioRef = useRef<HTMLAudioElement|null>(null);

  const mm = String(Math.floor(currentTime / 60)).padStart(2, "0");
  const ss = String(Math.floor(currentTime % 60)).padStart(2, "0");
  const tmm = String(Math.floor(currentDuration / 60)).padStart(2, "0");
  const tss = String(Math.floor(currentDuration % 60)).padStart(2, "0");

  const progress = currentDuration > 0 ? (currentTime / currentDuration) * 100 : 0;

  return (
    <div style={{ display:"flex", alignItems:"center", gap:13, padding:"13px 16px", background:"#f9fafb", borderRadius:10, border:"1px solid #e5e7eb" }}>
      {content.url && (
        <audio
          ref={audioRef}
          src={content.url}
          onEnded={() => { setPlaying(false); setCurrentTime(0); }}
          onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={e => {
            const dur = Math.floor(e.currentTarget.duration);
            setCurrentDuration(dur);
            if (dur !== content.duration) onUpdate({ ...content, duration: dur });
          }}
        />
      )}
      <button onClick={() => { if (!audioRef.current) return; playing ? audioRef.current.pause() : audioRef.current.play(); setPlaying(p => !p); }}
        style={{ width:36, height:36, borderRadius:"50%", background:"#22c55e", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {playing
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <div contentEditable suppressContentEditableWarning onBlur={e => onUpdate({ ...content, title:e.currentTarget.innerText })}
          style={{ fontSize:13, color:"#374151", marginBottom:6, outline:"none" }}>{content.title}</div>
        <div style={{ height:4, background:"#e5e7eb", borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:"#22c55e", borderRadius:4, transition:"width 0.1s linear" }}/>
        </div>
      </div>
      <span style={{ fontSize:12, color:"#9ca3af", flexShrink:0 }}>{mm}:{ss} / {tmm}:{tss}</span>
    </div>
  );
}

function ImageBlock({ blockId, courseId, lessonId, content, onUpdate }: { blockId:string; courseId:string; lessonId:string; content:ImageContent; onUpdate:(d:ImageContent)=>void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !courseId || !lessonId) return;
    setUploading(true);
    try {
      const path = `courses/${courseId}/lessons/${lessonId}/${blockId}_${f.name}`;
      const url = await uploadFile(f, path);
      onUpdate({ ...content, url });
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {content.url ? (
        <div style={{ position:"relative" }}>
          <img src={content.url} alt={content.caption} style={{ width:"100%", display:"block" }}/>
          <button onClick={() => onUpdate({ ...content, url:"" })}
            style={{ position:"absolute", top:8, right:8, width:24, height:24, borderRadius:4, background:"rgba(0,0,0,0.5)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ) : (
        <div onClick={() => !uploading && ref.current?.click()}
          style={{ height:160, background:"#f3f4f6", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, border:"2px dashed #d1d5db", cursor:uploading?"wait":"pointer", borderRadius:6 }}>
          <input type="file" ref={ref} hidden accept="image/*" onChange={onFileSelect}/>
          {uploading ? (
            <div style={{ width:24, height:24, border:"3px solid #e5e7eb", borderTopColor:"#22c55e", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          )}
          <span style={{ fontSize:13, color:"#9ca3af" }}>{uploading ? "Uploading..." : "Click to upload image"}</span>
        </div>
      )}
      <input value={content.caption} onChange={e => onUpdate({ ...content, caption:e.target.value })} placeholder="Add a caption..."
        style={{ width:"100%", border:"none", borderTop:"1px solid #f3f4f6", padding:"6px 0", fontSize:12, color:"#6b7280", textAlign:"center", outline:"none", background:"transparent" }}/>
    </div>
  );
}

function KeyTermsBlock({ content, onUpdate }: { content:KeyTermsContent; onUpdate:(d:KeyTermsContent)=>void }) {
  const upd = (i: number, f: keyof KeyTerm, v: string) => { const t = [...content.terms]; t[i] = { ...t[i], [f]:v }; onUpdate({ terms:t }); };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {content.terms.map((term, i) => (
        <div key={i} style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, padding:"12px 14px", position:"relative" }}>
          <button onClick={() => onUpdate({ terms:content.terms.filter((_,j)=>j!==i) })}
            style={{ position:"absolute", top:8, right:8, background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16, lineHeight:1 }}>×</button>
          <div style={{ display:"flex", gap:8, marginBottom:6 }}>
            <input value={term.word}       onChange={e => upd(i,"word",e.target.value)}       placeholder="Word"       style={{ flex:2, padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:13, fontWeight:600, color:"#111", outline:"none" }}/>
            <input value={term.type}       onChange={e => upd(i,"type",e.target.value)}       placeholder="noun, verb…" style={{ flex:1, padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:12, color:"#6b7280", outline:"none", fontStyle:"italic" }}/>
          </div>
          <input value={term.definition}   onChange={e => upd(i,"definition",e.target.value)} placeholder="Definition..." style={{ width:"100%", padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:13, color:"#374151", outline:"none" }}/>
        </div>
      ))}
      <button onClick={() => onUpdate({ terms:[...content.terms,{word:"",type:"",definition:""}] })}
        style={{ alignSelf:"flex-start", background:"none", border:"1px dashed #d1d5db", borderRadius:6, padding:"6px 14px", fontSize:12, color:"#9ca3af", cursor:"pointer" }}>+ Add term</button>
    </div>
  );
}

function FormulaBlock({ content, onUpdate }: { content:FormulaContent; onUpdate:(d:FormulaContent)=>void }) {
  const upd = (i: number, f: keyof FormulaStep, v: string|number) => { const s = [...content.steps]; s[i] = { ...s[i], [f]:v }; onUpdate({ ...content, steps:s }); };
  return (
    <div>
      <input value={content.title} onChange={e => onUpdate({ ...content, title:e.target.value })} placeholder="Formula title..."
        style={{ width:"100%", fontSize:15, fontWeight:700, color:"#111", border:"none", outline:"none", marginBottom:10, background:"transparent" }}/>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {content.steps.map((step, i) => (
          <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", background:"#22c55e", color:"white", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:6 }}>{step.stepNumber}</div>
            <div style={{ flex:1 }}>
              <input value={step.label}       onChange={e => upd(i,"label",e.target.value)}       placeholder="Label"        style={{ width:"100%", fontSize:13, fontWeight:600, color:"#111", border:"none", borderBottom:"1px solid #e5e7eb", outline:"none", paddingBottom:3, marginBottom:4, background:"transparent" }}/>
              <input value={step.description} onChange={e => upd(i,"description",e.target.value)} placeholder="Description..." style={{ width:"100%", fontSize:13, color:"#374151", border:"none", outline:"none", background:"transparent" }}/>
            </div>
          </div>
        ))}
        <button onClick={() => onUpdate({ ...content, steps:[...content.steps,{stepNumber:content.steps.length+1,label:"",description:""}] })}
          style={{ alignSelf:"flex-start", background:"none", border:"1px dashed #d1d5db", borderRadius:6, padding:"5px 12px", fontSize:12, color:"#9ca3af", cursor:"pointer" }}>+ Add step</button>
      </div>
    </div>
  );
}

function FileBlock({ content, onUpdate }: { content:FileContent; onUpdate:(d:FileContent)=>void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8 }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"#374151", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{content.fileName || "No file selected"}</div>
        <input value={content.fileUrl} onChange={e => onUpdate({ ...content, fileUrl:e.target.value })} placeholder="Paste URL..."
          style={{ width:"100%", fontSize:11, color:"#22c55e", border:"none", outline:"none", background:"transparent", textDecoration:"underline" }}/>
      </div>
      <input type="file" ref={fileRef} hidden onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onUpdate({ fileUrl:ev.target?.result as string, fileName:f.name }); r.readAsDataURL(f); }}/>
      <button onClick={() => fileRef.current?.click()}
        style={{ padding:"5px 10px", background:"white", border:"1px solid #e5e7eb", borderRadius:6, fontSize:11, fontWeight:600, color:"#374151", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>Upload</button>
    </div>
  );
}

function BlockContent({ block, onUpdate, courseId, lessonId }: { block:Block; onUpdate:(id:string,d:any)=>void; courseId:string; lessonId:string }) {
  const u = (d: any) => onUpdate(block.id, d);
  switch (block.type) {
    case "heading":  return <HeadingBlock  content={block.content as HeadingContent}  onUpdate={u}/>;
    case "text":     return <TextBlock     content={block.content as TextContent}     onUpdate={u}/>;
    case "audio":    return <AudioBlock    content={block.content as AudioContent}    onUpdate={u}/>;
    case "image":    return <ImageBlock    blockId={block.id} courseId={courseId} lessonId={lessonId} content={block.content as ImageContent} onUpdate={u}/>;
    case "keyTerms": return <KeyTermsBlock content={block.content as KeyTermsContent} onUpdate={u}/>;
    case "formula":  return <FormulaBlock  content={block.content as FormulaContent}  onUpdate={u}/>;
    case "file":     return <FileBlock     content={block.content as FileContent}     onUpdate={u}/>;
    default:         return <div style={{ fontSize:13, color:"#9ca3af", padding:"12px 0" }}>Unsupported: {block.type}</div>;
  }
}

// ─── Shared style constants ────────────────────────────────────────────────────
const pLbl: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 };
const pInp: React.CSSProperties = { width:"100%", padding:"7px 9px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, color:"#111", background:"white", outline:"none" };
const pSec: React.CSSProperties = { fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 };
const FONTS   = ["DM Sans","Inter","Georgia","Merriweather","Roboto Mono","Arial"];
const WEIGHTS = [{ l:"Regular", v:"400" }, { l:"Medium", v:"500" }, { l:"SemiBold", v:"600" }, { l:"Bold", v:"700" }];

// ─── Typography Section ────────────────────────────────────────────────────────
function TypographySection({ s, onChange }: { s:TextStyle; onChange:(ns:TextStyle)=>void }) {
  const u = (patch: Partial<TextStyle>) => onChange({ ...s, ...patch });
  return (
    <>
      <div style={pSec}>Typography</div>
      <select value={s.fontFamily} onChange={e => u({ fontFamily:e.target.value })} style={{ ...pInp, marginBottom:8, cursor:"pointer" }}>
        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <div style={{ flex:1 }}>
          <label style={pLbl}>Weight</label>
          <select value={s.fontWeight} onChange={e => u({ fontWeight:e.target.value, bold:e.target.value==="700" })} style={{ ...pInp, cursor:"pointer" }}>
            {WEIGHTS.map(w => <option key={w.v} value={w.v}>{w.l}</option>)}
          </select>
        </div>
        <div style={{ width:78 }}>
          <label style={pLbl}>Size (px)</label>
          <input type="number" value={s.fontSize} min={8} max={96} onChange={e => u({ fontSize:+e.target.value||16 })} style={{ ...pInp, textAlign:"center" }}/>
        </div>
      </div>
      <div style={pSec}>Formatting</div>
      <div style={{ display:"flex", gap:4, marginBottom:6 }}>
        {[
          { k:"bold"          as const, l:"B", extra:{ fontWeight:800 } },
          { k:"italic"        as const, l:"I", extra:{ fontStyle:"italic" as const } },
          { k:"underline"     as const, l:"U", extra:{ textDecoration:"underline" } },
          { k:"strikethrough" as const, l:"S", extra:{ textDecoration:"line-through" } },
        ].map(btn => (
          <button key={btn.k} onClick={() => u({ [btn.k]:!s[btn.k] })}
            style={{ flex:1, height:34, border:`1.5px solid ${s[btn.k]?"#22c55e":"#e5e7eb"}`, borderRadius:6, background:s[btn.k]?"#f0fdf4":"white", cursor:"pointer", fontSize:13, color:s[btn.k]?"#22c55e":"#374151", ...btn.extra }}>
            {btn.l}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", gap:4, marginBottom:12 }}>
        {(["left","center","right","justify"] as const).map(a => (
          <button key={a} onClick={() => u({ align:a })}
            style={{ flex:1, height:34, border:`1.5px solid ${s.align===a?"#22c55e":"#e5e7eb"}`, borderRadius:6, background:s.align===a?"#f0fdf4":"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={s.align===a?"#22c55e":"#9ca3af"} strokeWidth="2.2">
              {a==="left"    && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></>}
              {a==="center"  && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></>}
              {a==="right"   && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></>}
              {a==="justify" && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
            </svg>
          </button>
        ))}
      </div>
      <div style={pSec}>Colors</div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <div style={{ flex:1 }}>
          <label style={pLbl}>Text</label>
          <div style={{ display:"flex", alignItems:"center", gap:6, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px" }}>
            <input type="color" value={s.color} onChange={e => u({ color:e.target.value })} style={{ width:22, height:22, border:"none", padding:0, cursor:"pointer", borderRadius:3, background:"none", flexShrink:0 }}/>
            <span style={{ fontSize:10, color:"#374151", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis" }}>{s.color}</span>
          </div>
        </div>
        <div style={{ flex:1 }}>
          <label style={pLbl}>Background</label>
          <div style={{ display:"flex", alignItems:"center", gap:6, border:"1px solid #e5e7eb", borderRadius:7, padding:"5px 8px" }}>
            <input type="color" value={s.background==="transparent"?"#ffffff":s.background}
              onChange={e => u({ background:e.target.value })} style={{ width:22, height:22, border:"none", padding:0, cursor:"pointer", borderRadius:3, background:"none", flexShrink:0 }}/>
            <button onClick={() => u({ background:"transparent" })}
              style={{ flex:1, fontSize:10, color:s.background==="transparent"?"#22c55e":"#9ca3af", background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0 }}>
              {s.background === "transparent" ? "None ✓" : "Clear"}
            </button>
          </div>
        </div>
      </div>
      <div style={pSec}>Spacing</div>
      <div style={{ display:"flex", gap:8 }}>
        <div style={{ flex:1 }}>
          <label style={pLbl}>Line Height</label>
          <input type="number" value={s.lineHeight} step={0.05} min={1} max={4} onChange={e => u({ lineHeight:+e.target.value||1.5 })} style={{ ...pInp, textAlign:"center" }}/>
        </div>
        <div style={{ flex:1 }}>
          <label style={pLbl}>Letter Spacing</label>
          <input type="number" value={s.letterSpacing} step={0.01} min={-0.1} max={0.5} onChange={e => u({ letterSpacing:+e.target.value||0 })} style={{ ...pInp, textAlign:"center" }}/>
        </div>
      </div>
    </>
  );
}

// ─── Properties Panel ──────────────────────────────────────────────────────────
function PropertiesPanel({ block, onUpdate, courseId, lessonId }: { block:Block|null; onUpdate:(id:string,d:any)=>void; courseId:string; lessonId:string }) {
  if (!block) return (
    <div style={{ padding:"40px 20px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ margin:"0 auto 12px", display:"block" }}>
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
      Select a block to edit its properties
    </div>
  );

  const u = (d: any) => onUpdate(block.id, d);
  const typeLabel: Record<string,string> = { heading:"Heading", text:"Text", audio:"Audio", image:"Image", keyTerms:"Key Terms", formula:"Formula", file:"File" };

  return (
    <div style={{ overflowY:"auto", height:"100%" }}>
      <div style={{ padding:"15px 20px", borderBottom:"1px solid #f3f4f6", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"white", zIndex:1 }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#111" }}>{typeLabel[block.type] ?? block.type} Properties</span>
        <span style={{ fontSize:11, fontWeight:600, color:"#22c55e", background:"#f0fdf4", padding:"2px 9px", borderRadius:20 }}>Selected</span>
      </div>
      <div style={{ padding:20 }}>

        {/* HEADING */}
        {block.type === "heading" && (() => {
          const c     = block.content as HeadingContent;
          const level = (c.text.match(/^<(h[1-3])/)?.[1] ?? (c as any)._level ?? "h2") as "h1"|"h2"|"h3";
          const s     = getStyle(c, { ...DEFAULT_HEADING_STYLE, fontSize:{h1:28,h2:22,h3:17}[level]||22 });
          const plain = stripHtml(c.text);
          return (
            <>
              <div style={pSec}>Heading Level</div>
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                {(["h1","h2","h3"] as const).map(lv => (
                  <button key={lv} onClick={() => { const ns={...s,fontSize:{h1:28,h2:22,h3:17}[lv]}; u({...c,text:buildHeadingHtml(plain,lv,ns),_level:lv,_style:ns}); }}
                    style={{ flex:1, padding:"8px 0", border:`1.5px solid ${level===lv?"#22c55e":"#e5e7eb"}`, borderRadius:7, background:level===lv?"#f0fdf4":"white", fontSize:13, fontWeight:700, color:level===lv?"#22c55e":"#6b7280", cursor:"pointer" }}>
                    {lv.toUpperCase()}
                  </button>
                ))}
              </div>
              <TypographySection s={s} onChange={ns => u({...c,text:buildHeadingHtml(plain,level,ns),_level:level,_style:ns})}/>
              <div style={{ ...pSec, marginTop:14 }}>Content</div>
              <textarea value={plain} rows={2} onChange={e => u({...c,text:buildHeadingHtml(e.target.value,level,s),_level:level,_style:s})}
                style={{ ...pInp, resize:"none", lineHeight:1.6 }}/>
            </>
          );
        })()}

        {/* TEXT */}
        {block.type === "text" && (() => {
          const c       = block.content as TextContent;
          const isBoxed = (c as any)._boxed ?? c.text.includes("border:1.5px solid #22c55e");
          const s       = getStyle(c, DEFAULT_TEXT_STYLE);
          const plain   = stripHtml(c.text);
          return (
            <>
              <div style={pSec}>Style</div>
              <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                {[{l:"Normal",v:false},{l:"Boxed",v:true}].map(opt => (
                  <button key={opt.l} onClick={() => u({...c,text:buildBodyHtml(plain,opt.v,s),_boxed:opt.v,_style:s})}
                    style={{ flex:1, padding:"8px 0", border:`1.5px solid ${isBoxed===opt.v?"#22c55e":"#e5e7eb"}`, borderRadius:7, background:isBoxed===opt.v?"#f0fdf4":"white", fontSize:12, fontWeight:600, color:isBoxed===opt.v?"#22c55e":"#6b7280", cursor:"pointer" }}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <TypographySection s={s} onChange={ns => u({...c,text:buildBodyHtml(plain,isBoxed,ns),_boxed:isBoxed,_style:ns})}/>
              <div style={{ ...pSec, marginTop:14 }}>Content</div>
              <textarea value={plain} rows={5} onChange={e => u({...c,text:buildBodyHtml(e.target.value,isBoxed,s),_boxed:isBoxed,_style:s})}
                style={{ ...pInp, resize:"vertical", lineHeight:1.65 }}/>
            </>
          );
        })()}

        {/* AUDIO */}
        {block.type === "audio" && (() => {
          const c      = block.content as AudioContent;
          const audRef = useRef<HTMLInputElement>(null);
          const [up, setUp] = useState(false);
          const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (!f || !courseId || !lessonId) return;
            setUp(true);
            try {
              const path = `courses/${courseId}/lessons/${lessonId}/${block.id}_${f.name}`;
              const url = await uploadFile(f, path);
              u({ ...c, url, title: c.title || f.name, duration: 0 });
            } catch (err) { console.error(err); alert("Audio upload failed."); }
            finally { setUp(false); }
          };
          return (
            <>
              <div style={pSec}>Audio File</div>
              <input type="file" ref={audRef} hidden accept="audio/*" onChange={onFile}/>
              <button onClick={() => !up && audRef.current?.click()}
                style={{ width:"100%", padding:"9px 0", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:7, fontSize:12, fontWeight:600, color:"#374151", cursor:up?"wait":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:10 }}>
                {up ? (
                  <div style={{ width:12, height:12, border:"2px solid #e5e7eb", borderTopColor:"#22c55e", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                )}
                {up ? "Uploading..." : "Upload Audio File"}
              </button>
              {c.url && !c.url.startsWith("data:") && <div style={{ fontSize:11, color:"#22c55e", marginBottom:8, background:"#f0fdf4", padding:"4px 8px", borderRadius:5 }}>✓ File uploaded</div>}
              <label style={pLbl}>Or Paste URL</label>
              <input value={c.url.startsWith("data:") ? "" : (c.url||"")} onChange={e => u({...c,url:e.target.value})} placeholder="https://..." style={{ ...pInp, marginBottom:8 }}/>
              <label style={pLbl}>Title</label>
              <input value={c.title} onChange={e => u({...c,title:e.target.value})} style={{ ...pInp, marginBottom:8 }}/>
              <label style={pLbl}>Duration (seconds)</label>
              <input type="number" value={c.duration} onChange={e => u({...c,duration:+e.target.value})} style={{ ...pInp, marginBottom:8 }}/>
              <label style={pLbl}>Transcript</label>
              <textarea value={(c as any).transcript||""} rows={3} onChange={e => u({...c,transcript:e.target.value})}
                placeholder="Type transcript here..." style={{ ...pInp, resize:"none", lineHeight:1.6 }}/>
            </>
          );
        })()}

        {/* IMAGE */}
        {block.type === "image" && (() => {
          const c         = block.content as ImageContent;
          const imgUpRef  = useRef<HTMLInputElement>(null);
          const [up, setUp] = useState(false);
          const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (!f || !courseId || !lessonId) return;
            setUp(true);
            try {
              const path = `courses/${courseId}/lessons/${lessonId}/${block.id}_${f.name}`;
              const url = await uploadFile(f, path);
              u({ ...c, url });
            } catch (err) { console.error(err); alert("Image upload failed."); }
            finally { setUp(false); }
          };
          return (
            <>
              <div style={pSec}>Image</div>
              {c.url ? (
                <div style={{ position:"relative", marginBottom:10 }}>
                  <img src={c.url} alt={c.caption} style={{ width:"100%", borderRadius:6, display:"block" }}/>
                  <button onClick={() => u({...c,url:""})} style={{ position:"absolute", top:6, right:6, width:22, height:22, borderRadius:4, background:"rgba(0,0,0,0.5)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input type="file" ref={imgUpRef} hidden accept="image/*" onChange={onFile}/>
                  <button onClick={() => !up && imgUpRef.current?.click()}
                    style={{ width:"100%", padding:"10px 0", background:"#f3f4f6", border:"1px dashed #d1d5db", borderRadius:7, fontSize:12, fontWeight:600, color:"#374151", cursor:up?"wait":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:8 }}>
                    {up ? (
                      <div style={{ width:12, height:12, border:"2px solid #e5e7eb", borderTopColor:"#22c55e", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    )}
                    {up ? "Uploading..." : "Upload Image"}
                  </button>
                  <label style={pLbl}>Or Paste URL</label>
                  <input value={c.url} onChange={e => u({...c,url:e.target.value})} placeholder="https://..." style={{ ...pInp, marginBottom:8 }}/>
                </>
              )}
              <label style={pLbl}>Caption</label>
              <input value={c.caption} onChange={e => u({...c,caption:e.target.value})} placeholder="Image caption..." style={pInp}/>
            </>
          );
        })()}

        {/* KEY TERMS */}
        {block.type === "keyTerms" && (() => {
          const c = block.content as KeyTermsContent;
          return (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={pSec}>Terms ({c.terms.length})</div>
                <button onClick={() => u({terms:[...c.terms,{word:"",type:"",definition:""}]})}
                  style={{ fontSize:11, fontWeight:600, color:"#22c55e", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, padding:"3px 10px", cursor:"pointer" }}>+ Add</button>
              </div>
              {c.terms.map((term, i) => (
                <div key={i} style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Term {i+1}</span>
                    <button onClick={() => u({terms:c.terms.filter((_,j)=>j!==i)})} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:14, lineHeight:1 }}>×</button>
                  </div>
                  <div style={{ display:"flex", gap:6, marginBottom:5 }}>
                    <input value={term.word} onChange={e => { const t=[...c.terms]; t[i]={...t[i],word:e.target.value}; u({terms:t}); }} placeholder="Word" style={{ flex:2, padding:"5px 7px", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, fontWeight:600, color:"#111", outline:"none" }}/>
                    <input value={term.type} onChange={e => { const t=[...c.terms]; t[i]={...t[i],type:e.target.value}; u({terms:t}); }} placeholder="noun…" style={{ flex:1, padding:"5px 7px", border:"1px solid #e5e7eb", borderRadius:5, fontSize:11, color:"#6b7280", outline:"none", fontStyle:"italic" }}/>
                  </div>
                  <input value={term.definition} onChange={e => { const t=[...c.terms]; t[i]={...t[i],definition:e.target.value}; u({terms:t}); }} placeholder="Definition..." style={{ width:"100%", padding:"5px 7px", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, color:"#374151", outline:"none" }}/>
                </div>
              ))}
            </>
          );
        })()}

        {/* FORMULA */}
        {block.type === "formula" && (() => {
          const c = block.content as FormulaContent;
          return (
            <>
              <label style={pLbl}>Formula Title</label>
              <input value={c.title} onChange={e => u({...c,title:e.target.value})} style={{ ...pInp, marginBottom:12 }}/>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={pSec}>Steps ({c.steps.length})</div>
                <button onClick={() => u({...c,steps:[...c.steps,{stepNumber:c.steps.length+1,label:"",description:""}]})}
                  style={{ fontSize:11, fontWeight:600, color:"#22c55e", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, padding:"3px 10px", cursor:"pointer" }}>+ Add</button>
              </div>
              {c.steps.map((step, i) => (
                <div key={i} style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:"#22c55e", color:"white", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{step.stepNumber}</div>
                      <span style={{ fontSize:11, fontWeight:600, color:"#6b7280" }}>Step {i+1}</span>
                    </div>
                    <button onClick={() => u({...c,steps:c.steps.filter((_,j)=>j!==i)})} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:14, lineHeight:1 }}>×</button>
                  </div>
                  <input value={step.label} onChange={e => { const s=[...c.steps]; s[i]={...s[i],label:e.target.value}; u({...c,steps:s}); }} placeholder="Label" style={{ width:"100%", padding:"5px 7px", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, fontWeight:600, color:"#111", outline:"none", marginBottom:4 }}/>
                  <input value={step.description} onChange={e => { const s=[...c.steps]; s[i]={...s[i],description:e.target.value}; u({...c,steps:s}); }} placeholder="Description..." style={{ width:"100%", padding:"5px 7px", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, color:"#374151", outline:"none" }}/>
                </div>
              ))}
            </>
          );
        })()}

        {/* FILE */}
        {block.type === "file" && (() => {
          const c          = block.content as FileContent;
          const fileUpRef  = useRef<HTMLInputElement>(null);
          const [up, setUp] = useState(false);
          const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (!f || !courseId || !lessonId) return;
            setUp(true);
            try {
              const path = `courses/${courseId}/lessons/${lessonId}/${block.id}_${f.name}`;
              const url = await uploadFile(f, path);
              u({ fileUrl: url, fileName: f.name });
            } catch (err) { console.error(err); alert("File upload failed."); }
            finally { setUp(false); }
          };
          return (
            <>
              <div style={pSec}>File</div>
              <input type="file" ref={fileUpRef} hidden onChange={onFile}/>
              <button onClick={() => !up && fileUpRef.current?.click()}
                style={{ width:"100%", padding:"10px 0", background:"#f3f4f6", border:"1px dashed #d1d5db", borderRadius:7, fontSize:12, fontWeight:600, color:"#374151", cursor:up?"wait":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:10 }}>
                {up ? (
                  <div style={{ width:12, height:12, border:"2px solid #e5e7eb", borderTopColor:"#22c55e", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                )}
                {up ? "Uploading..." : "Upload File"}
              </button>
              {c.fileUrl && !c.fileUrl.startsWith("data:") && <div style={{ fontSize:11, color:"#22c55e", marginBottom:8, background:"#f0fdf4", padding:"4px 8px", borderRadius:5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✓ {c.fileName||"File ready"}</div>}
              <label style={pLbl}>Or Paste URL</label>
              <input value={c.fileUrl.startsWith("data:") ? "" : (c.fileUrl||"")} onChange={e => u({...c,fileUrl:e.target.value})} placeholder="https://..." style={{ ...pInp, marginBottom:8 }}/>
              <label style={pLbl}>Display Name</label>
              <input value={c.fileName||""} onChange={e => u({...c,fileName:e.target.value})} style={{ ...pInp, marginBottom:0 }}/>
              {c.fileUrl && (
                <a href={c.fileUrl} download={c.fileName||"download"} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:10, padding:"8px 0", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:7, fontSize:12, fontWeight:600, color:"#16a34a", textDecoration:"none" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download File
                </a>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── AI Panel ──────────────────────────────────────────────────────────────────
// Callable references — defined once outside the component to avoid re-creation
const generateLessonContentFn = httpsCallable<
  {
    lessonId:      string;
    userPrompt:    string;
    documentText?: string;
    lessonMeta:    { title:string; type:string; level:string; description:string };
    currentBlocks: { type:string; preview:string }[];
  },
  {
    reasoning:       string;
    suggestedBlocks: { type:string; content:Record<string,any> }[];
    metaUpdates:     Record<string,string> | null;
    logId:           string;
  }
>(functions, "generateLessonContent");

const markAILogAcceptedFn = httpsCallable<{ logId:string }, { success:boolean }>(
  functions, "markAILogAccepted"
);

interface AIMessage {
  id:      string;
  role:    "user" | "ai";
  text:    string;
  blocks?: Block[];
  logId?:  string;
}

function AIPanel({
  meta,
  lessonId,
  currentBlocks,
  onAISuggestion,
}: {
  meta:            LessonMeta;
  lessonId:        string;
  currentBlocks:   Block[];
  onAISuggestion:  (blocks:Block[], logId?:string) => void;
}) {
  const [messages,  setMessages]  = useState<AIMessage[]>([
    { id:uid(), role:"ai", text:"Hello! I'm your AI lesson assistant. Ask me to generate content, upload a document to build a lesson from it, or describe what you need." },
  ]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const scrollRef                 = useRef<HTMLDivElement>(null);
  const fileRef                   = useRef<HTMLInputElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // ── Build a lightweight block summary for the prompt ─────────────────────────
  const buildBlockSummary = () =>
    currentBlocks.map(b => ({
      type:    b.type,
      preview: b.type === "heading" || b.type === "text"
        ? (b.content as any).text?.replace(/<[^>]+>/g,"").slice(0,60) ?? ""
        : b.type === "keyTerms"
          ? `${(b.content as any).terms?.length ?? 0} terms`
          : b.type === "formula"
            ? ((b.content as any).title ?? "").slice(0,40)
            : b.type,
    }));

  // ── Send message ──────────────────────────────────────────────────────────────
  const send = async (text?: string, documentText?: string) => {
    const msg = (text || input).trim();
    if ((!msg && !documentText) || loading) return;
    setInput("");

    // Add user message to thread
    const displayText = documentText ? `📄 Document uploaded — ${msg || "generating lesson content..."}` : msg;
    setMessages(p => [...p, { id:uid(), role:"user", text:displayText }]);
    setLoading(true);

    try {
      const result = await generateLessonContentFn({
        lessonId:     lessonId || "draft",
        userPrompt:   msg || "Generate lesson content from this document.",
        documentText: documentText,
        lessonMeta: {
          title:       meta.title,
          type:        meta.type,
          level:       meta.level,
          description: meta.description,
        },
        currentBlocks: buildBlockSummary(),
      });

      const { reasoning, suggestedBlocks, metaUpdates, logId } = result.data;

      // Convert GeminiBlocks → full LessonBuilder Blocks
      const newBlocks: Block[] = suggestedBlocks.map(gb => ({
        id:          uid(),
        type:        gb.type as BlockType,
        order:       0,
        content:     gb.content as unknown as Block["content"],
        aiGenerated: true,
      }));

      const aiMsgId = uid();
      setMessages(p => [...p, {
        id:     aiMsgId,
        role:   "ai",
        text:   reasoning,
        blocks: newBlocks.length > 0 ? newBlocks : undefined,
        logId,
      }]);

    } catch (err: any) {
      const errMsg = err?.message ?? "Something went wrong. Please try again.";
      setMessages(p => [...p, { id:uid(), role:"ai", text:`Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Accept blocks → add to canvas + mark log accepted ────────────────────────
  const handleAccept = async (blocks: Block[], logId?: string) => {
    onAISuggestion(blocks, logId);
    if (logId) {
      try { await markAILogAcceptedFn({ logId }); } catch { /* non-critical */ }
    }
  };

  // ── File upload → read as text → send ────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-uploaded
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      send("Generate lesson content from this document.", content);
    };
    reader.onerror = () => setMessages(p => [...p, { id:uid(), role:"ai", text:"Failed to read the file. Please try a .txt or .md file." }]);
    reader.readAsText(file);
  };

  const QUICK_PROMPTS = [
    "Generate a vocabulary list for this topic",
    "Add a grammar explanation section",
    "Create comprehension questions",
    "Summarize the key points in a text block",
  ];

  const RECS = [
    { bg:"#fde8e8", icon:"📄", label:"Import Document",   sub:"Build lesson from .txt/.md", action:() => fileRef.current?.click() },
    { bg:"#fef9c3", icon:"📗", label:"Vocabulary List",   sub:"Generate from topic",         action:() => send("Generate a vocabulary list for this lesson topic.") },
    { bg:"#f0fdf4", icon:"⚙️", label:"Grammar Structure", sub:"Add a formula block",          action:() => send("Add a grammar structure or formula block relevant to this lesson.") },
    { bg:"#eff6ff", icon:"❓", label:"Comprehension Qs",  sub:"Create questions",             action:() => send("Generate comprehension questions based on the current lesson content.") },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Hidden file input */}
      <input type="file" ref={fileRef} hidden accept=".txt,.md" onChange={handleFileUpload}/>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:"1px solid #f3f4f6", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e" }}/>
          <span style={{ fontSize:12, color:"#374151", fontWeight:500 }}>Gemini Flash Active</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:20, padding:"3px 10px" }}>
          <span style={{ fontSize:12 }}>😊</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#d97706" }}>Friendly</span>
        </div>
      </div>

      {/* Message thread */}
      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map(msg => (
          <div key={msg.id}>
            {/* Bubble */}
            <div style={{ display:"flex", gap:8, justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
              {msg.role === "ai" && (
                <div style={{ width:26, height:26, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                </div>
              )}
              <div style={{ background:msg.role==="user"?"#22c55e":"#f3f4f6", color:msg.role==="user"?"white":"#374151", padding:"9px 12px", borderRadius:msg.role==="user"?"14px 14px 2px 14px":"14px 14px 14px 2px", fontSize:13, lineHeight:1.55, maxWidth:"78%", whiteSpace:"pre-line", order:msg.role==="user"?1:2 }}>
                {msg.text}
              </div>
              {msg.role === "user" && (
                <div style={{ width:26, height:26, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2, order:2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              )}
            </div>

            {/* AI reaction row */}
            {msg.role === "ai" && (
              <div style={{ display:"flex", gap:6, marginTop:5, marginLeft:34 }}>
                {["👍","👎","⧉","↺"].map(icon => <button key={icon} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#9ca3af", padding:2 }}>{icon}</button>)}
              </div>
            )}

            {/* Block preview + Add to Lesson button */}
            {msg.role === "ai" && msg.blocks && msg.blocks.length > 0 && (
              <div style={{ marginLeft:34, marginTop:8 }}>
                {/* Preview card */}
                <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:9, padding:"10px 12px", marginBottom:8 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:"0.05em", marginBottom:7 }}>
                    {msg.blocks.length} block{msg.blocks.length !== 1 ? "s" : ""} ready to add
                  </div>
                  {msg.blocks.slice(0, 4).map((b, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 0", borderBottom:i < Math.min(msg.blocks!.length,4)-1 ? "1px solid #f3f4f6" : "none" }}>
                      <div style={{ width:22, height:22, borderRadius:5, background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {BLOCK_ICONS[b.type] ?? <span style={{ fontSize:10 }}>■</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#374151", textTransform:"capitalize" as const }}>{b.type}</div>
                        <div style={{ fontSize:10, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {((b.content as any)?.text ?? (b.content as any)?.title ?? "")
                            .replace(/<[^>]+>/g,"").slice(0,45) || "Content ready"}
                        </div>
                      </div>
                    </div>
                  ))}
                  {msg.blocks.length > 4 && (
                    <div style={{ fontSize:11, color:"#9ca3af", paddingTop:5, textAlign:"center" as const }}>+{msg.blocks.length - 4} more blocks...</div>
                  )}
                </div>
                {/* Add to Lesson CTA */}
                <button onClick={() => handleAccept(msg.blocks!, msg.logId)}
                  style={{ width:"100%", padding:"8px 0", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add to Lesson
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:"#f0fdf4", border:"1px solid #bbf7d0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </div>
            <div style={{ background:"#f3f4f6", padding:"9px 12px", borderRadius:"14px 14px 14px 2px", fontSize:13, color:"#9ca3af" }}>Thinking...</div>
          </div>
        )}

        {/* Quick prompts (shown when not loading) */}
        {!loading && (
          <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:4 }}>
            {QUICK_PROMPTS.map(q => (
              <button key={q} onClick={() => send(q)}
                style={{ textAlign:"left", background:"#22c55e", color:"white", border:"none", borderRadius:20, padding:"8px 14px", fontSize:12, fontWeight:500, cursor:"pointer", lineHeight:1.4 }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input row */}
      <div style={{ padding:"12px 20px", borderTop:"1px solid #f3f4f6", display:"flex", alignItems:"center", gap:7, flexShrink:0 }}>
        {/* Doc upload trigger */}
        <button onClick={() => fileRef.current?.click()} title="Upload .txt or .md document"
          style={{ width:28, height:28, borderRadius:7, border:"1px solid #e5e7eb", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <input value={input} disabled={loading}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask AI to help with your lesson..."
          style={{ flex:1, border:"none", outline:"none", fontSize:13, color:"#374151", background:"transparent" }}/>
        <button onClick={() => send()} disabled={loading || !input.trim()}
          style={{ width:28, height:28, borderRadius:"50%", background:loading?"#d1d5db":"#22c55e", border:"none", cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      {/* Quick action recommendations */}
      <div style={{ padding:"10px 14px", borderTop:"1px solid #f3f4f6", flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#374151", marginBottom:9 }}>Quick Actions</div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {RECS.map(r => (
            <div key={r.label} onClick={r.action}
              style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer", padding:"4px 6px", borderRadius:8 }}
              onMouseOver={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
              onMouseOut={e  => (e.currentTarget as HTMLElement).style.background = "transparent"}>
              <div style={{ width:32, height:32, borderRadius:8, background:r.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{r.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#111" }}>{r.label}</div>
                <div style={{ fontSize:11, color:"#9ca3af" }}>{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ meta, setMeta }: { meta:LessonMeta; setMeta:(m:LessonMeta)=>void }) {
  const inp: React.CSSProperties = { width:"100%", padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:13, color:"#111", background:"white", outline:"none" };
  const lbl: React.CSSProperties = { display:"block", fontSize:11, fontWeight:600, color:"#6b7280", marginBottom:4 };
  const sec: React.CSSProperties = { fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em", padding:"10px 0 7px" };
  const hr:  React.CSSProperties = { height:1, background:"#f3f4f6", margin:"8px 0" };
  const Toggle = ({ val, onChange }: { val:boolean; onChange:()=>void }) => (
    <button onClick={onChange} style={{ width:38, height:21, borderRadius:11, border:"none", background:val?"#22c55e":"#d1d5db", position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
      <div style={{ width:15, height:15, borderRadius:"50%", background:"white", position:"absolute", top:3, left:val?20:3, transition:"left 0.2s" }}/>
    </button>
  );
  return (
    <div style={{ padding:"0 20px 24px" }}>
      <div style={sec}>Metadata</div>
      <label style={lbl}>Lesson Title</label>
      <input style={{ ...inp, marginBottom:10 }} value={meta.title} onChange={e => setMeta({ ...meta, title:e.target.value })}/>
      <label style={lbl}>Description</label>
      <textarea rows={2} style={{ ...inp, resize:"none", lineHeight:1.6, marginBottom:10 }} value={meta.description} onChange={e => setMeta({ ...meta, description:e.target.value })}/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        <div><label style={lbl}>Type</label><select style={inp} value={meta.type} onChange={e => setMeta({ ...meta, type:e.target.value })}>{["Listening","Reading","Writing","Speaking","Vocabulary","Grammar","General"].map(t=><option key={t}>{t}</option>)}</select></div>
        <div><label style={lbl}>Level</label><select style={inp} value={meta.level} onChange={e => setMeta({ ...meta, level:e.target.value })}>{["A1","A2","B1","B2","C1","C2"].map(l=><option key={l}>{l}</option>)}</select></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        <div><label style={lbl}>Duration (min)</label><input style={inp} type="number" value={meta.duration} onChange={e => setMeta({ ...meta, duration:+e.target.value })}/></div>
        <div><label style={lbl}>Order</label><input style={inp} type="number" value={meta.order} onChange={e => setMeta({ ...meta, order:+e.target.value })}/></div>
      </div>
      <label style={lbl}>Thumbnail URL</label>
      <input style={{ ...inp, marginBottom:0 }} value={meta.thumbnail} onChange={e => setMeta({ ...meta, thumbnail:e.target.value })} placeholder="https://..."/>
      <div style={hr}/>
      <div style={sec}>Language Settings</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        <div><label style={lbl}>Target Language</label><select style={inp} value={meta.targetLanguage} onChange={e => setMeta({ ...meta, targetLanguage:e.target.value })}>{["English","French","Spanish","German","Japanese"].map(l=><option key={l}>{l}</option>)}</select></div>
        <div><label style={lbl}>Native Language</label><select style={inp} value={meta.nativeLanguage} onChange={e => setMeta({ ...meta, nativeLanguage:e.target.value })}>{["Vietnamese","English","French","Spanish","Chinese"].map(l=><option key={l}>{l}</option>)}</select></div>
      </div>
      <label style={lbl}>Learning Objectives</label>
      <textarea rows={3} style={{ ...inp, resize:"none", lineHeight:1.6 }} value={meta.objectives} onChange={e => setMeta({ ...meta, objectives:e.target.value })} placeholder="What will students achieve?"/>
      <div style={{ textAlign:"right", fontSize:10, color:"#9ca3af", marginTop:2, marginBottom:8 }}>{meta.objectives.length}/300</div>
      <div style={hr}/>
      <div style={sec}>Tags</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
        {meta.tags.map((tag, i) => (
          <div key={tag} style={{ display:"flex", alignItems:"center", gap:4, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:20, padding:"3px 8px" }}>
            <span style={{ fontSize:12, color:"#16a34a", fontWeight:500 }}>{tag}</span>
            <button onClick={() => setMeta({ ...meta, tags:meta.tags.filter((_,j)=>j!==i) })} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", padding:0, fontSize:13, lineHeight:1 }}>×</button>
          </div>
        ))}
        <button onClick={() => { const t = window.prompt("Add tag:"); if (t?.trim()) setMeta({ ...meta, tags:[...meta.tags, t.trim()] }); }}
          style={{ display:"flex", alignItems:"center", gap:4, background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#6b7280", fontWeight:500, padding:0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add tag
        </button>
      </div>
      <div style={hr}/>
      <div style={sec}>Preferences</div>
      {[
        { label:"Auto-save changes",   key:"autoSave"          as const },
        { label:"Show translations",   key:"showTranslations"  as const },
        { label:"Enable audio playback",key:"enableAudio"      as const },
      ].map(p => (
        <div key={p.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <span style={{ fontSize:13, color:"#374151" }}>{p.label}</span>
          <Toggle val={meta[p.key] as boolean} onChange={() => setMeta({ ...meta, [p.key]:!meta[p.key] })}/>
        </div>
      ))}
    </div>
  );
}

// ─── Content Panel ─────────────────────────────────────────────────────────────
function ContentPanel({ blockDefs, onAddBlock, onReorderDefs, onUpload, onDragStateChange, courseId, lessonId }: {
  blockDefs:         typeof BLOCK_DEFS;
  onAddBlock:        (type:BlockType) => void;
  onReorderDefs:     (from:number, to:number) => void;
  onUpload:          (blocks:Block[]) => void;
  onDragStateChange: (dragging:boolean) => void;
  courseId:          string;
  lessonId:          string;
}) {
  const [search,      setSearch]      = useState("");
  const [palDragOver, setPalDragOver] = useState<number|null>(null);
  const [uploading,   setUploading]   = useState(false);
  const filtered = blockDefs.filter(b => b.label.toLowerCase().includes(search.toLowerCase()));
  const docRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const audRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (f: File, kind: "doc"|"img"|"aud"|"vid") => {
    if (!courseId || !lessonId) return;
    setUploading(true);
    try {
      const bid = uid();
      const path = `courses/${courseId}/lessons/${lessonId}/${bid}_${f.name}`;
      const url = await uploadFile(f, path);

      if (kind === "img") {
        const b = mkBlock("image"); b.id = bid;
        (b.content as ImageContent).url = url;
        (b.content as ImageContent).caption = f.name;
        onUpload([b]);
      } else if (kind === "aud") {
        const b = mkBlock("audio"); b.id = bid;
        (b.content as AudioContent).url = url;
        (b.content as AudioContent).title = f.name;
        onUpload([b]);
      } else {
        const b = mkBlock("file"); b.id = bid;
        (b.content as FileContent).fileUrl = url;
        (b.content as FileContent).fileName = f.name;
        onUpload([b]);
      }
    } catch (err) {
      console.error(err);
      alert("File upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding:"16px 20px", position:"relative" }}>
      {uploading && (
        <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, background:"rgba(255,255,255,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}>
          <div style={{ width:30, height:30, border:"3px solid #e5e7eb", borderTopColor:"#22c55e", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
          <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>Uploading...</span>
        </div>
      )}
      <div style={{ position:"relative", marginBottom:12 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search blocks..."
          style={{ width:"100%", padding:"8px 10px 8px 28px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none" }}/>
      </div>
      <button style={{ width:"100%", padding:"9px 14px", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7, marginBottom:16 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        AI Finder
      </button>
      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:8 }}>Uploads</div>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[
          { l:"Doc", ref:docRef, accept:".doc,.docx,.pdf,.txt", cb:(f:File) => handleUpload(f,"doc") },
          { l:"Img", ref:imgRef, accept:"image/*",              cb:(f:File) => handleUpload(f,"img") },
          { l:"Aud", ref:audRef, accept:"audio/*",              cb:(f:File) => handleUpload(f,"aud") },
          { l:"Vid", ref:vidRef, accept:"video/*",              cb:(f:File) => handleUpload(f,"vid") },
        ].map(u => (
          <button key={u.l} onClick={() => u.ref.current?.click()}
            style={{ flex:1, paddingTop:10, paddingBottom:8, border:"1px solid #e5e7eb", borderRadius:8, background:"white", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
            <input type="file" ref={u.ref} hidden accept={u.accept} onChange={e => { const f=e.target.files?.[0]; if(f) u.cb(f); }}/>
            {BLOCK_ICONS[u.l==="Doc"?"file":u.l==="Img"?"image":u.l==="Aud"?"audio":"file"]}
            <span style={{ fontSize:11, color:"#6b7280" }}>{u.l}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:8 }}>Basic Blocks</div>
      <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
        {filtered.map(block => {
          const realIdx   = blockDefs.findIndex(b => b.type === block.type);
          const isDragOver = palDragOver === realIdx;
          return (
            <div key={block.type} draggable
              onDragStart={e => { g_dragType="palette"; g_dragBlockType=block.type; g_paletteDragIdx=realIdx; e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",block.type); onDragStateChange(true); }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setPalDragOver(realIdx); }}
              onDragLeave={() => setPalDragOver(null)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); setPalDragOver(null); if(g_paletteDragIdx>=0&&g_paletteDragIdx!==realIdx) onReorderDefs(g_paletteDragIdx,realIdx); g_paletteDragIdx=-1; onDragStateChange(false); }}
              onDragEnd={() => { setPalDragOver(null); g_paletteDragIdx=-1; onDragStateChange(false); }}
              onClick={() => onAddBlock(block.type)}
              onMouseOver={e => (e.currentTarget as HTMLElement).style.background = isDragOver?"#f0fdf4":"#f9fafb"}
              onMouseOut={e  => (e.currentTarget as HTMLElement).style.background = isDragOver?"#f0fdf4":"transparent"}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 15px", borderRadius:10, background:isDragOver?"#f0fdf4":"transparent", cursor:"grab", userSelect:"none", border:isDragOver?"1.5px dashed #22c55e":"1.5px solid transparent", transition:"all 0.1s" }}>
              <div style={{ color:"#d1d5db", flexShrink:0 }}>
                <svg width="12" height="16" viewBox="0 0 10 18" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="7" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="7" cy="15" r="1.5"/></svg>
              </div>
              <div style={{ width:40, height:40, borderRadius:8, background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{BLOCK_ICONS[block.type]}</div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"#111" }}>{block.label}</div>
                <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{block.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Download helper ───────────────────────────────────────────────────────────
const downloadLesson = (meta: LessonMeta, blocks: Block[]) => {
  const body = blocks.map(b => { try { return blockToHtml(b.type, b.content); } catch { return ""; } }).join("\n\n");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${meta.title||"Lesson"}</title><style>body{font-family:'Segoe UI',sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#374151;line-height:1.75;}h1,h2,h3{color:#111827;margin:1em 0 0.4em;}p{margin:0 0 .75em;}img{max-width:100%;border-radius:6px;}.meta{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:28px;}</style></head><body><div class="meta"><h2 style="margin:0 0 8px;font-size:18px;">${meta.title||"Untitled"}</h2><p style="margin:0;color:#6b7280;">${meta.description||""}</p><p style="margin-top:6px;font-size:12px;color:#9ca3af;">${meta.type} · ${meta.level} · ${meta.duration} min</p></div>${body}</body></html>`;
  const a = document.createElement("a");
  a.href     = URL.createObjectURL(new Blob([html], { type:"text/html" }));
  a.download = `${(meta.title||"lesson").replace(/[^a-z0-9]/gi,"_")}.html`;
  a.click();
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function LessonBuilder() {
  const { lessonId } = useParams<{ lessonId:string }>();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { user }     = useAuth();

  const [loading,       setLoading]       = useState(true);
  const [leftTab,       setLeftTab]       = useState<LeftTab>("content");
  const [rightPanel,    setRightPanel]    = useState<RightPanel>("properties");
  const [selectedBlock, setSelectedBlock] = useState<string|null>(null);
  const [zoom,          setZoom]          = useState(100);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(true);
  const [dropIndex,     setDropIndex]     = useState<number|null>(null);
  const [blockDefs,     setBlockDefs]     = useState(BLOCK_DEFS);
  const [isDragging,    setIsDragging]    = useState(false);

  const canvasDragIdx  = useRef<number|null>(null);
  const isDirtyRef     = useRef(false);
  const autoSaveTimer  = useRef<ReturnType<typeof setTimeout>|null>(null);

  const stateData = location.state as any;
  const courseId  = stateData?.courseInfo?.courseId || stateData?.courseId || "";
  const sectionId = stateData?.sectionId || "";

  const [meta, setMeta] = useState<LessonMeta>({
    title:"", description:"", type:"General", level:"A1", duration:30, order:1, thumbnail:"",
    targetLanguage:"English", nativeLanguage:"Vietnamese", objectives:"", tags:[],
    autoSave:true, showTranslations:true, enableAudio:true, metadata:{ hasVideo:false, hasAudio:false },
  });
  const [blocks, setBlocks] = useState<Block[]>([]);

  // ── Load lesson ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lessonId || !courseId) { setLoading(false); return; }
    if (stateData?.title) setMeta(m => ({ ...m, title:stateData.title, type:stateData.type||m.type, level:stateData.level||m.level, duration:stateData.duration||m.duration }));
    Promise.all([getLesson(courseId, lessonId), getBlocks(courseId, lessonId)]).then(([ld, bd]) => {
      if (ld) setMeta(m => ({ ...m, title:ld.title, description:ld.description, type:ld.type, duration:ld.duration, order:ld.order, thumbnail:ld.thumbnail, metadata:ld.metadata }));
      if (bd.length > 0) setBlocks(bd);
      setLoading(false);
    });
  }, [lessonId, courseId]);

  // ── Auto-save (blocks-only) ───────────────────────────────────────────────────
  const scheduleAutoSave = useCallback(() => {
    if (!meta.autoSave || loading || !lessonId || !courseId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { if (isDirtyRef.current) performSave(false); }, 8000);
  }, [meta.autoSave, loading, lessonId, courseId]);

  // ── Block mutations ───────────────────────────────────────────────────────────
  const addBlock = useCallback((type: BlockType) => {
    const b = mkBlock(type);
    setBlocks(prev => [...prev, b]);
    setSelectedBlock(b.id);
    setRightPanel("properties");
    setSaved(false); isDirtyRef.current = true; scheduleAutoSave();
  }, [scheduleAutoSave]);

  const updateBlockData = (id: string, data: any) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content:data } : b));
    setSaved(false); isDirtyRef.current = true; scheduleAutoSave();
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlock === id) setSelectedBlock(null);
    setSaved(false); isDirtyRef.current = true; scheduleAutoSave();
  };

  const reorderPalette = (from: number, to: number) => {
    setBlockDefs(prev => { const a=[...prev]; const[item]=a.splice(from,1); a.splice(to,0,item); return a; });
  };

  // ── Canvas DnD ────────────────────────────────────────────────────────────────
  const handleCanvasDragStart = (e: React.DragEvent, index: number) => {
    g_dragType = "canvas"; g_dragCanvasIdx = index; canvasDragIdx.current = index;
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", index.toString());
    setIsDragging(true);
  };
  const handleDropZoneDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); e.stopPropagation(); setDropIndex(index); };
  const handleDropZoneDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault(); e.stopPropagation(); setDropIndex(null); setIsDragging(false);
    if (g_dragType === "palette") {
      const b = mkBlock(g_dragBlockType);
      setBlocks(prev => { const a=[...prev]; a.splice(index,0,b); return a; });
      setSelectedBlock(b.id); setRightPanel("properties");
    } else {
      const from = canvasDragIdx.current;
      if (from === null || from === index || from === index-1) return;
      setBlocks(prev => { const a=[...prev]; const[rm]=a.splice(from,1); a.splice(from<index?index-1:index,0,rm); return a; });
    }
    canvasDragIdx.current = null; setSaved(false); isDirtyRef.current = true;
  };
  const handleDragEnd = () => { setDropIndex(null); canvasDragIdx.current = null; setIsDragging(false); };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const performSave = async (close = true) => {
    if (!lessonId || !courseId) { if (close) navigate(-1); return; }
    setSaving(true);
    try {
      const hasVideo = blocks.some(b => b.type === "video");
      const hasAudio = blocks.some(b => b.type === "audio");
      await saveLesson(courseId, { lessonId, sectionId, title:meta.title||"Untitled Lesson", description:meta.description, type:meta.type, duration:meta.duration, order:meta.order, thumbnail:meta.thumbnail, aiGenerated:false, metadata:{ hasVideo, hasAudio } });
      await saveBlocks(courseId, lessonId, blocks.map((b,idx) => ({ ...b, order:idx })));
      if (stateData?.courseInfo) {
        const cs: Section[] = stateData.courseInfo.sections || [];
        const us = cs.map((s: Section) => {
          const sid = (s as any).id || (s as any).sectionId;
          if (sid !== sectionId) return s;
          const items = s.items || [];
          const ei    = items.findIndex((i: SectionItem) => i.id === lessonId);
          const li: LessonItem = { id:lessonId, kind:"lesson", number:ei>=0?items[ei].number:items.filter((i:SectionItem)=>i.kind==="lesson").length+1, title:meta.title||"Untitled Lesson", type:meta.type as any, duration:meta.duration||30, exerciseCount:0 };
          const ni = [...items]; ei>=0 ? (ni[ei]=li) : ni.push(li); return { ...s, items:ni };
        });
        await updateSections(courseId, us);
        const tl = us.reduce((a:number,s:Section) => a+s.items.filter((i:SectionItem)=>i.kind==="lesson").length, 0);
        const te = us.reduce((a:number,s:Section) => a+s.items.filter((i:SectionItem)=>i.kind==="exercise").length, 0);
        await updateCourse(courseId, { totalLessons:tl, totalExercises:te, sections:us });
        stateData.courseInfo.sections = us;
      }
      setSaved(true); isDirtyRef.current = false;
      if (close) navigate(-1);
    } catch (err) {
      console.error("Save failed:", err);
      if (close) alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const selectedBlockObj = blocks.find(b => b.id === selectedBlock) || null;

  const DropZone = ({ index }: { index:number }) => {
    const active = dropIndex === index;
    return (
      <div onDragOver={e => handleDropZoneDragOver(e, index)} onDrop={e => handleDropZoneDrop(e, index)}
        style={{ height:isDragging?24:4, background:active?"#22c55e":"transparent", borderRadius:2, margin:active?"2px 28px":"0 28px", transition:"all 0.1s", position:"relative", zIndex:10 }}>
        {active && <div style={{ position:"absolute", left:-6, top:"50%", transform:"translateY(-50%)", width:12, height:12, borderRadius:"50%", background:"#22c55e" }}/>}
      </div>
    );
  };

  if (loading) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f5f6fa", fontFamily:"'DM Sans',sans-serif", color:"#9ca3af", fontSize:14 }}>
      Loading lesson builder...
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;overflow:hidden}
        input,select,textarea,button{font-family:'DM Sans',sans-serif}
        .lb-block{position:relative;transition:background 0.1s}
        .lb-block:hover .lb-drag{opacity:1!important}
        .lb-block:hover .lb-del{opacity:1!important}
        .lb-block.lb-sel{outline:2px solid #22c55e;outline-offset:2px;border-radius:6px}
        .lb-block.lb-dragging{opacity:0.4}
        .lb-ltab,.lb-rtab{flex:1;padding:13px 0;background:none;border:none;border-bottom:2px solid transparent;font-size:13px;font-weight:600;color:#9ca3af;cursor:pointer;transition:color 0.15s,border-color 0.15s}
        .lb-ltab.on,.lb-rtab.on{color:#22c55e;border-bottom-color:#22c55e}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div style={{ height:52, background:"#111", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px", flexShrink:0, zIndex:50 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
            <button onClick={() => navigate(-1)} style={{ width:28, height:28, borderRadius:6, background:"rgba(255,255,255,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={() => navigate(-1)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"rgba(255,255,255,0.45)", padding:0 }}>{stateData?.courseInfo?.title || "Course"}</button>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>{meta.title || "Untitled Lesson"}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <span contentEditable suppressContentEditableWarning onBlur={e => setMeta(m => ({ ...m, title:e.currentTarget.innerText }))}
              style={{ fontSize:14, fontWeight:600, color:"white", outline:"none" }}>{meta.title || "Untitled Lesson"}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"flex-end" }}>
            <div style={{ display:"flex", gap:2 }}>
              {[0,1,2].map(i => (
                <button key={i} style={{ width:28, height:28, borderRadius:5, background:i===0?"rgba(255,255,255,0.12)":"transparent", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={i===0?"white":"rgba(255,255,255,0.35)"} strokeWidth="2">
                    {i===0&&<><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>}
                    {i===1&&<rect x="5" y="2" width="14" height="20" rx="2"/>}
                    {i===2&&<rect x="7" y="2" width="10" height="20" rx="2"/>}
                  </svg>
                </button>
              ))}
            </div>
            <button onClick={() => downloadLesson(meta, blocks)}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", border:"1px solid rgba(255,255,255,0.18)", borderRadius:8, background:"transparent", color:"white", fontSize:12, fontWeight:500, cursor:"pointer" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
            <button style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px", border:"1px solid rgba(255,255,255,0.18)", borderRadius:8, background:"transparent", color:"white", fontSize:13, fontWeight:500, cursor:"pointer" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Preview
            </button>
            <button onClick={() => performSave(true)}
              style={{ padding:"6px 16px", background:"#22c55e", border:"none", borderRadius:8, color:"white", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              {saving ? "Saving..." : "Save & Close"}
            </button>
          </div>
        </div>

        {/* ── 3-column body ─────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", minHeight:0 }}>

          {/* Left sidebar */}
          <div style={{ width:280, background:"white", borderRight:"1px solid #e5e7eb", display:"flex", flexDirection:"column", flexShrink:0 }}>
            <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
              <button className={`lb-ltab${leftTab==="settings"?" on":""}`} onClick={() => setLeftTab("settings")}>Settings</button>
              <button className={`lb-ltab${leftTab==="content"?"  on":""}`}  onClick={() => setLeftTab("content")}>Content</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
              {leftTab === "settings"
                ? <SettingsPanel meta={meta} setMeta={setMeta}/>
                : <ContentPanel blockDefs={blockDefs} onAddBlock={addBlock} onReorderDefs={reorderPalette}
                    onUpload={nb => { setBlocks(p=>[...p,...nb]); setSaved(false); isDirtyRef.current=true; setSelectedBlock(nb[0]?.id||null); setRightPanel("properties"); scheduleAutoSave(); }}
                    onDragStateChange={setIsDragging} courseId={courseId} lessonId={lessonId || ""}/>}
            </div>
          </div>

          {/* Canvas */}
          <div style={{ flex:1, overflow:"auto", background:"#e8eaed", position:"relative", minHeight:0 }}
            onClick={() => setSelectedBlock(null)}
            onDragLeave={e => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) setDropIndex(null); }}
            onDragOver={e => e.preventDefault()}>
            <div style={{ position:"sticky", top:0, zIndex:10, display:"flex", justifyContent:"center", padding:"10px 0", background:"rgba(232,234,237,0.9)", backdropFilter:"blur(4px)" }}>
              <div style={{ display:"flex", alignItems:"center", background:"white", borderRadius:20, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                <button onClick={() => setZoom(z => Math.max(50, z-10))} style={{ padding:"5px 13px", background:"none", border:"none", cursor:"pointer", color:"#6b7280", fontSize:17, lineHeight:1 }}>−</button>
                <span style={{ padding:"5px 14px", fontSize:13, fontWeight:600, color:"#374151", borderLeft:"1px solid #e5e7eb", borderRight:"1px solid #e5e7eb" }}>{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(150, z+10))} style={{ padding:"5px 13px", background:"none", border:"none", cursor:"pointer", color:"#6b7280", fontSize:17, lineHeight:1 }}>+</button>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"center", padding:"0 40px 80px", minHeight:"calc(100% - 46px)" }}>
              <div style={{ width:"100%", maxWidth:850, transform:`scale(${zoom/100})`, transformOrigin:"top center", marginBottom:zoom<100?`${(zoom/100-1)*100}%`:0 }}>
                <div style={{ background:"white", borderRadius:2, boxShadow:"0 1px 12px rgba(0,0,0,0.1)", overflow:"hidden", minHeight:600 }} onClick={e => e.stopPropagation()}>
                  <DropZone index={0}/>
                  {blocks.map((block, idx) => (
                    <div key={block.id}>
                      <div draggable onDragStart={e => handleCanvasDragStart(e,idx)} onDragEnd={handleDragEnd}
                        onClick={e => { e.stopPropagation(); setSelectedBlock(block.id); setRightPanel("properties"); }}
                        className={["lb-block", selectedBlock===block.id?"lb-sel":"", canvasDragIdx.current===idx?"lb-dragging":""].join(" ")}
                        style={{ padding:block.type==="image"?0:"8px 40px 8px 52px", minHeight:40 }}>
                        {block.type !== "image" && (
                          <div className="lb-drag" style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", opacity:0, transition:"opacity 0.12s", cursor:"grab", color:"#d1d5db" }}>
                            <svg width="12" height="16" viewBox="0 0 12 20" fill="currentColor"><circle cx="4" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/><circle cx="4" cy="10" r="1.5"/><circle cx="8" cy="10" r="1.5"/><circle cx="4" cy="16" r="1.5"/><circle cx="8" cy="16" r="1.5"/></svg>
                          </div>
                        )}
                        <button className="lb-del" onClick={e => { e.stopPropagation(); removeBlock(block.id); }}
                          style={{ position:"absolute", top:7, right:7, width:22, height:22, borderRadius:4, background:"#fef2f2", border:"1px solid #fecaca", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity 0.12s", zIndex:5 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                        <BlockContent block={block} onUpdate={updateBlockData} courseId={courseId} lessonId={lessonId || ""}/>
                      </div>
                      <DropZone index={idx+1}/>
                    </div>
                  ))}
                  <div onClick={() => addBlock("text")}
                    onDragOver={e => { e.preventDefault(); setDropIndex(blocks.length); }}
                    onDrop={e => handleDropZoneDrop(e, blocks.length)}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor="#22c55e"; (e.currentTarget as HTMLElement).style.color="#22c55e"; }}
                    onMouseOut={e  => { (e.currentTarget as HTMLElement).style.borderColor="#e5e7eb"; (e.currentTarget as HTMLElement).style.color="#9ca3af"; }}
                    style={{ margin:"16px 28px 28px", padding:"14px", border:"2px dashed #e5e7eb", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer", color:"#9ca3af", fontSize:13, transition:"all 0.15s" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Click to add a block
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", display:"flex", alignItems:"center", gap:6, fontSize:12, color:saved?"#22c55e":"#f59e0b", fontWeight:500, background:"white", padding:"6px 14px", borderRadius:20, boxShadow:"0 1px 8px rgba(0,0,0,0.08)", border:"1px solid #e5e7eb", pointerEvents:"none", zIndex:20 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {saved ? "All changes saved" : "Unsaved changes"}
            </div>
          </div>

          {/* Right panel */}
          <div style={{ width:320, background:"white", borderLeft:"1px solid #e5e7eb", display:"flex", flexDirection:"column", flexShrink:0, minHeight:0 }}>
            <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
              <button className={`lb-rtab${rightPanel==="ai"?" on":""}`}         onClick={() => setRightPanel("ai")}>AI Assistant</button>
              <button className={`lb-rtab${rightPanel==="properties"?" on":""}`} onClick={() => setRightPanel("properties")}>Properties</button>
            </div>
            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>
              {rightPanel === "ai"
                ? <AIPanel
                    meta={meta}
                    lessonId={lessonId ?? ""}
                    currentBlocks={blocks}
                    onAISuggestion={(nb, logId) => {
                      setBlocks(p => [...p, ...nb]);
                      setSaved(false);
                      isDirtyRef.current = true;
                      scheduleAutoSave();
                      // logId already marked accepted inside AIPanel.handleAccept
                    }}/>
                : <PropertiesPanel block={selectedBlockObj} onUpdate={updateBlockData} courseId={courseId} lessonId={lessonId || ""}/>}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}