import { useState, useRef, useEffect, useCallback } from "react";
import { auth, signInWithGoogle, logOut, onAuthChange, saveUserData, loadUserData } from "./firebase";

const MODEL = "claude-sonnet-4-20250514";

// ═══════════════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════════════
const THEMES = {
  pink: {
    id: "pink", label: "Pink Bows", emoji: "🎀",
    bg: "linear-gradient(170deg, #fff5f7 0%, #ffe0eb 40%, #ffeef4 100%)",
    surface: "#ffffff", surfaceAlt: "#fff0f3",
    accent: "#e84393", accentGlow: "rgba(232,67,147,0.18)",
    accentLight: "#fd79a8", accentDark: "#c0306e",
    titleFrom: "#d63384", titleTo: "#e84393",
    green: "#00b894", red: "#e74c3c",
    text: "#2d1f2f", textMuted: "#9b7f9b",
    border: "#f5d5e0",
    shadow: "0 2px 16px rgba(232,67,147,0.08)",
    cardShadow: "0 4px 24px rgba(232,67,147,0.06)",
    decoChar: "🎀", decoName: "bows",
  },
  forest: {
    id: "forest", label: "Deep Forest", emoji: "🌿",
    bg: "linear-gradient(170deg, #f0f7f0 0%, #d5ecd5 40%, #e8f5e8 100%)",
    surface: "#ffffff", surfaceAlt: "#edf7ed",
    accent: "#2d6a4f", accentGlow: "rgba(45,106,79,0.15)",
    accentLight: "#52b788", accentDark: "#1b4332",
    titleFrom: "#1b4332", titleTo: "#2d6a4f",
    green: "#40916c", red: "#e74c3c",
    text: "#1b2e1b", textMuted: "#6b8f6b",
    border: "#c8e0c8",
    shadow: "0 2px 16px rgba(45,106,79,0.08)",
    cardShadow: "0 4px 24px rgba(45,106,79,0.06)",
    decoChar: "🍃", decoName: "leaves",
  },
  blue: {
    id: "blue", label: "Baby Blue", emoji: "💙",
    bg: "linear-gradient(170deg, #f0f7ff 0%, #dbeafe 40%, #eff6ff 100%)",
    surface: "#ffffff", surfaceAlt: "#eff6ff",
    accent: "#3b82f6", accentGlow: "rgba(59,130,246,0.15)",
    accentLight: "#93c5fd", accentDark: "#1d4ed8",
    titleFrom: "#1d4ed8", titleTo: "#3b82f6",
    green: "#10b981", red: "#ef4444",
    text: "#1e293b", textMuted: "#7b9bc5",
    border: "#c7dbf5",
    shadow: "0 2px 16px rgba(59,130,246,0.08)",
    cardShadow: "0 4px 24px rgba(59,130,246,0.06)",
    decoChar: "💙", decoName: "hearts",
  },
  yellow: {
    id: "yellow", label: "Sunny", emoji: "☀️",
    bg: "linear-gradient(170deg, #fffef5 0%, #fef3c7 40%, #fefce8 100%)",
    surface: "#ffffff", surfaceAlt: "#fefce8",
    accent: "#d97706", accentGlow: "rgba(217,119,6,0.15)",
    accentLight: "#fbbf24", accentDark: "#92400e",
    titleFrom: "#92400e", titleTo: "#b45309",
    green: "#10b981", red: "#ef4444",
    text: "#292524", textMuted: "#a8956b",
    border: "#e8dbb5",
    shadow: "0 2px 16px rgba(217,119,6,0.08)",
    cardShadow: "0 4px 24px rgba(217,119,6,0.06)",
    decoChar: "☀️", decoName: "suns",
  },
};

const DEFAULT_CLASSES = [
  { id: "alg2", name: "Algebra 2 / Precalc", nick: "", icon: "📐" },
  { id: "bio", name: "Biology", nick: "", icon: "🧬" },
  { id: "ush", name: "US History", nick: "", icon: "🇺🇸" },
  { id: "eng", name: "English Lit", nick: "", icon: "📚" },
  { id: "chem", name: "Chemistry", nick: "", icon: "⚗️" },
  { id: "phys", name: "Physics", nick: "", icon: "⚛️" },
];

function dn(c) { return (c?.nick || c?.name || ""); }

const MODES = [
  { id: "explain", icon: "📖", label: "Explain" },
  { id: "hint", icon: "💡", label: "Hints" },
  { id: "quiz", icon: "🎯", label: "Quiz" },
  { id: "babyfy", icon: "🧒", label: "Babyfy" },
  { id: "stepbystep", icon: "🪜", label: "Steps" },
];

// ═══════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════
async function askClaudeRaw(systemPrompt, userContent, useSearch = false) {
  const body = { model: MODEL, max_tokens: 1000, system: systemPrompt, messages: Array.isArray(userContent) && userContent[0]?.role ? userContent : [{ role: "user", content: userContent }] };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    return data.content?.map(b => b.text || "").filter(Boolean).join("\n") || "No response.";
  } catch (e) { clearTimeout(timer); return e.name === "AbortError" ? "Request timed out." : "Something went wrong."; }
}
async function researchClass(name) {
  return await askClaudeRaw(`You are a curriculum research assistant for "${name}". Use web search to find key topics, concepts, formulas, vocabulary, common problem types. Return a structured summary.`, `Research curriculum for: "${name}"`, true);
}

const PROMPTS = {
  explain: (d, c, kb) => `You are a friendly tutor for "${c}" class. Difficulty: ${d}.\n${kb ? `--- KNOWLEDGE BASE ---\n${kb}\n---\n` : ""}Show step-by-step solution, give the final answer, explain WHY, suggest a practice question. Analyze any images/files provided.`,
  hint: (lvl, c, kb) => `You are a tutor giving Hint ${lvl}/3 for "${c}" class.\n${kb ? `--- KNOWLEDGE BASE ---\n${kb}\n---\n` : ""}Hint 1: gentle nudge. Hint 2: more direction. Hint 3: walk through most of it. Give ONLY hint ${lvl}.`,
  quiz: (d, c, kb) => `Generate a 3-question quiz for "${c}" class. Difficulty: ${d}.\n${kb ? `--- KNOWLEDGE BASE ---\n${kb}\n---\n` : ""}If file content provided, cover ALL key topics from it.\nFormat EXACTLY as JSON (no fences): {"questions":[{"q":"text","options":["A","B","C","D"],"answer":"A","explanation":"why"}]}`,
  babyfy: (c, kb) => `Explain this concept from "${c}" to a 12-year-old.\n${kb ? `--- KNOWLEDGE BASE ---\n${kb}\n---\n` : ""}Use simple words, fun analogies, relatable examples. Keep it short and fun.`,
  stepByStep: (c, kb) => `You are a Socratic tutor for "${c}".\n${kb ? `--- KNOWLEDGE BASE ---\n${kb}\n---\n` : ""}Guide with leading questions, don't give the answer. Be encouraging.`,
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function readFileAsText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); }); }
function readFileAsBase64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); }); }

function needsReResearch(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (x === y) return false;
  const lvl = ["ap","honors","ib","advanced","intro","remedial","college prep","cp","gt","gifted","accelerated","regular","on-level","dual enrollment","de"];
  const wa = new Set(x.split(/[\s\/\-,]+/)), wb = new Set(y.split(/[\s\/\-,]+/));
  for (const k of lvl) { if ((wa.has(k) || x.includes(k)) !== (wb.has(k) || y.includes(k))) return true; }
  let shared = 0; for (const w of wa) if (wb.has(w)) shared++;
  if (shared / new Set([...wa, ...wb]).size < 0.4) return true;
  if (Math.abs(x.length - y.length) > 3) return true;
  let diff = 0; const l = x.length > y.length ? x : y, s = x.length <= y.length ? x : y;
  for (let i = 0; i < l.length; i++) if (s[i] !== l[i]) diff++;
  return diff > 2;
}

function mkBtn(t) { return { background: `linear-gradient(135deg, ${t.accent}, ${t.accentLight})`, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", boxShadow: `0 2px 10px ${t.accentGlow}` }; }

// ═══════════════════════════════════════════════════════════════════
// MARKDOWN
// ═══════════════════════════════════════════════════════════════════
function Md({ text, t }) {
  if (!text) return null;
  return <div style={{ lineHeight: 1.7 }}>{text.split("\n").map((ln, i) => {
    if (ln.startsWith("### ")) return <h4 key={i} style={{ color: t.accent, margin: "12px 0 4px", fontSize: 15, fontWeight: 700 }}>{ln.slice(4)}</h4>;
    if (ln.startsWith("## ")) return <h3 key={i} style={{ color: t.accent, margin: "14px 0 6px", fontSize: 17, fontWeight: 700 }}>{ln.slice(3)}</h3>;
    if (ln.startsWith("# ")) return <h2 key={i} style={{ color: t.accentDark, margin: "16px 0 8px", fontSize: 19, fontWeight: 800 }}>{ln.slice(2)}</h2>;
    if (ln.startsWith("- ") || ln.startsWith("• ")) return <div key={i} style={{ paddingLeft: 18, position: "relative" }}><span style={{ position: "absolute", left: 4, color: t.accent }}>•</span>{inl(ln.slice(2), t)}</div>;
    if (/^\d+\.\s/.test(ln)) { const n = ln.match(/^(\d+)\.\s/)[1]; return <div key={i} style={{ paddingLeft: 22, position: "relative" }}><span style={{ position: "absolute", left: 2, color: t.accent, fontWeight: 700 }}>{n}.</span>{inl(ln.replace(/^\d+\.\s/, ""), t)}</div>; }
    if (ln.trim() === "") return <div key={i} style={{ height: 6 }} />;
    return <p key={i} style={{ margin: "3px 0" }}>{inl(ln, t)}</p>;
  })}</div>;
}
function inl(s, t) { return s.split(/(\*\*.*?\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i} style={{ color: t.accentDark }}>{p.slice(2, -2)}</strong> : p); }

// ═══════════════════════════════════════════════════════════════════
// QUIZ VIEW
// ═══════════════════════════════════════════════════════════════════
function QuizView({ quizData, onFinish, t }) {
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState(null);
  const [show, setShow] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = quizData.questions[cur];
  const pick = (o) => { if (show) return; setSel(o); setShow(true); if (o === q.answer) setScore(s => s + 1); };
  const next = () => { if (cur + 1 >= quizData.questions.length) setDone(true); else { setCur(c => c + 1); setSel(null); setShow(false); } };
  const bs = mkBtn(t);

  if (done) return <div style={{ textAlign: "center", padding: 24 }}>
    <div style={{ fontSize: 44, marginBottom: 10 }}>{score === 3 ? "🎉" : score >= 2 ? "👍" : "💪"}</div>
    <h3 style={{ color: t.text, fontSize: 20, marginBottom: 6 }}>You scored {score}/{quizData.questions.length}</h3>
    <p style={{ color: t.textMuted, marginBottom: 16 }}>{score === 3 ? "Perfect!" : score >= 2 ? "Almost there!" : "Keep practicing!"}</p>
    <button onClick={onFinish} style={bs}>Try Again</button>
  </div>;

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, color: t.textMuted, fontSize: 13 }}><span>Q{cur + 1}/{quizData.questions.length}</span><span style={{ color: t.accent, fontWeight: 700 }}>Score: {score}</span></div>
    <p style={{ color: t.text, fontSize: 15, fontWeight: 600, marginBottom: 14, lineHeight: 1.5 }}>{q.q}</p>
    {q.options.map((o, i) => { const L = ["A","B","C","D"][i], ok = show && L === q.answer, bad = show && L === sel && L !== q.answer;
      return <button key={i} onClick={() => pick(L)} style={{ display: "block", width: "100%", marginBottom: 6, background: ok ? `${t.green}18` : bad ? `${t.red}15` : t.surfaceAlt, border: `1.5px solid ${ok ? t.green : bad ? t.red : t.border}`, borderRadius: 10, padding: "10px 14px", color: t.text, cursor: show ? "default" : "pointer", textAlign: "left", fontSize: 14, fontFamily: "inherit" }}>
        <span style={{ fontWeight: 700, color: ok ? t.green : bad ? t.red : t.accent, marginRight: 8 }}>{L}.</span>{o}
      </button>; })}
    {show && <div style={{ marginTop: 10, padding: 12, background: t.surfaceAlt, borderRadius: 10, border: `1px solid ${t.border}` }}>
      <p style={{ color: t.accent, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Explanation</p>
      <p style={{ color: t.text, fontSize: 13, lineHeight: 1.5 }}>{q.explanation}</p>
      <button onClick={next} style={{ ...bs, marginTop: 10, width: "100%" }}>{cur + 1 >= quizData.questions.length ? "See Results" : "Next →"}</button>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// CLASS MANAGER
// ═══════════════════════════════════════════════════════════════════
function ClassManager({ classes, onSave, onClose, t }) {
  const [lc, setLc] = useState(classes.map(c => ({ ...c, nick: c.nick || "" })));
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editNick, setEditNick] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [newName, setNewName] = useState("");
  const [newNick, setNewNick] = useState("");
  const [newIcon, setNewIcon] = useState("📘");
  const [origNames] = useState(() => { const m = {}; classes.forEach(c => m[c.id] = c.name); return m; });
  const icons = ["📐","📘","🧬","⚗️","⚛️","🇺🇸","📚","🎨","🌍","💻","🎵","🏋️","📊","🧮","🔬","✏️","🗺️","💼"];
  const bs = mkBtn(t);
  const inputSt = { width: "100%", padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${t.border}`, fontSize: 13, fontFamily: "inherit", color: t.text, background: t.surface };

  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ background: t.surface, borderRadius: 20, padding: 20, maxWidth: 420, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "80vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: t.text }}>My Classes</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: t.textMuted }}>×</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {lc.map(c => <div key={c.id}>
          {editId === c.id ? <div style={{ padding: 10, background: t.surfaceAlt, borderRadius: 10, border: `1.5px solid ${t.accent}` }}>
            <p style={{ fontSize: 10, color: t.textMuted, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>Course Name</p>
            <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus style={{ ...inputSt, marginBottom: 8 }} placeholder="e.g. Honors Algebra 2" />
            <p style={{ fontSize: 10, color: t.textMuted, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>Nickname (optional)</p>
            <input value={editNick} onChange={e => setEditNick(e.target.value)} style={{ ...inputSt, marginBottom: 8 }} placeholder="e.g. Math" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
              {icons.map(ic => <button key={ic} onClick={() => setEditIcon(ic)} style={{ width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${editIcon === ic ? t.accent : t.border}`, background: editIcon === ic ? t.accentGlow : "transparent", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{ic}</button>)}
            </div>
            {origNames[c.id] && editName.trim() && origNames[c.id] !== editName.trim() && <p style={{ fontSize: 11, color: needsReResearch(origNames[c.id], editName.trim()) ? t.accent : t.green, marginBottom: 6, fontStyle: "italic" }}>
              {needsReResearch(origNames[c.id], editName.trim()) ? "⟳ Will refresh knowledge base" : "✓ Minor edit — knowledge stays"}
            </p>}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { if (editName.trim()) { setLc(p => p.map(x => x.id === editId ? { ...x, name: editName.trim(), nick: editNick.trim(), icon: editIcon } : x)); setEditId(null); } }} style={{ ...bs, flex: 1, padding: "7px", fontSize: 12 }}>Save</button>
              <button onClick={() => setEditId(null)} style={{ ...bs, flex: 1, padding: "7px", fontSize: 12, background: t.surfaceAlt, color: t.text, border: `1px solid ${t.border}`, boxShadow: "none" }}>Cancel</button>
            </div>
          </div> : <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: t.surfaceAlt, borderRadius: 10, border: `1px solid ${t.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.icon} {c.nick || c.name}</div>
              {c.nick && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditNick(c.nick || ""); setEditIcon(c.icon); }} style={{ background: "none", border: "none", color: t.accent, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>Edit</button>
              <button onClick={() => { setLc(p => p.filter(x => x.id !== c.id)); if (editId === c.id) setEditId(null); }} style={{ background: "none", border: "none", color: t.red, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>Remove</button>
            </div>
          </div>}
        </div>)}
      </div>
      <div style={{ background: t.surfaceAlt, borderRadius: 12, padding: 12, border: `1.5px dashed ${t.border}`, marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: t.accent, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Add a Class</p>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Course name" style={{ ...inputSt, marginBottom: 6 }} />
        <input value={newNick} onChange={e => setNewNick(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { setLc(p => [...p, { id: Date.now().toString(), name: newName.trim(), nick: newNick.trim(), icon: newIcon }]); setNewName(""); setNewNick(""); } }} placeholder="Nickname (optional)" style={{ ...inputSt, marginBottom: 8 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
          {icons.map(ic => <button key={ic} onClick={() => setNewIcon(ic)} style={{ width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${newIcon === ic ? t.accent : t.border}`, background: newIcon === ic ? t.accentGlow : "transparent", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{ic}</button>)}
        </div>
        <button onClick={() => { if (newName.trim()) { setLc(p => [...p, { id: Date.now().toString(), name: newName.trim(), nick: newNick.trim(), icon: newIcon }]); setNewName(""); setNewNick(""); } }} disabled={!newName.trim()} style={{ ...bs, width: "100%", opacity: newName.trim() ? 1 : 0.5, padding: "8px" }}>+ Add Class</button>
      </div>
      <button onClick={() => { const reIds = []; lc.forEach(c => { const o = origNames[c.id]; if (o && o !== c.name && needsReResearch(o, c.name)) reIds.push(c.id); }); onSave(lc, reIds); }} style={{ ...bs, width: "100%", padding: "10px", background: t.green, boxShadow: "none" }}>Save & Close</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// CAMERA MODAL
// ═══════════════════════════════════════════════════════════════════
function CameraModal({ onCapture, onClose, t }) {
  const vidRef = useRef(null); const canRef = useRef(null); const strRef = useRef(null);
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } } })
      .then(s => { strRef.current = s; if (vidRef.current) { vidRef.current.srcObject = s; vidRef.current.play(); } })
      .catch(() => { alert("Camera access denied"); onClose(); });
    return () => { if (strRef.current) strRef.current.getTracks().forEach(t => t.stop()); };
  }, []);
  const snap = () => {
    const v = vidRef.current, c = canRef.current; if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const url = c.toDataURL("image/jpeg", 0.85);
    onCapture({ name: "Photo", type: "image", base64: url.split(",")[1], previewUrl: url });
    onClose();
  };
  const bs = mkBtn(t);
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ background: t.surface, borderRadius: 18, padding: 14, maxWidth: 460, width: "90%" }}>
      <video ref={vidRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 12, background: "#000", minHeight: 180 }} />
      <canvas ref={canRef} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
        <button onClick={snap} style={{ ...bs, padding: "10px 24px" }}>📸 Capture</button>
        <button onClick={onClose} style={{ ...bs, padding: "10px 24px", background: t.surfaceAlt, color: t.text, border: `1px solid ${t.border}`, boxShadow: "none" }}>Cancel</button>
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE EDITOR
// ═══════════════════════════════════════════════════════════════════
function ProfileEditor({ t, profile, onSave }) {
  const [name, setName] = useState(profile?.name || "");
  const [avatar, setAvatar] = useState(profile?.avatar || "😊");
  const avatars = ["😊","😎","🤓","🧠","✨","🦊","🐱","🌸","🔥","💫","🎯","🌈","🍀","⭐","🎵","🦋","🐻","🌙"];
  const bs = mkBtn(t);
  const inputSt = { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${t.border}`, fontSize: 15, fontFamily: "inherit", color: t.text, background: t.surface };

  return <div style={{ flex: 1, padding: "40px 20px", animation: "fadeIn .3s ease", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
    <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>{avatar}</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: t.text, marginBottom: 4 }}>Edit Profile</h2>
      <p style={{ color: t.textMuted, fontSize: 14, marginBottom: 24 }}>Update your info</p>
      <div style={{ textAlign: "left", marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "block" }}>Display Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex" style={inputSt} />
      </div>
      <div style={{ textAlign: "left", marginBottom: 24 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "block" }}>Avatar</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {avatars.map(a => <button key={a} onClick={() => setAvatar(a)} style={{
            width: 42, height: 42, borderRadius: 12, fontSize: 22,
            border: `2px solid ${avatar === a ? t.accent : t.border}`,
            background: avatar === a ? t.accentGlow : t.surfaceAlt,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>{a}</button>)}
        </div>
      </div>
      <button onClick={() => { if (name.trim()) onSave({ ...profile, name: name.trim(), avatar }); }} disabled={!name.trim()} style={{ ...bs, width: "100%", padding: "14px", fontSize: 16, borderRadius: 14, opacity: name.trim() ? 1 : 0.5 }}>
        Save Changes
      </button>
      <button onClick={() => onSave(profile)} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 13, marginTop: 12 }}>Cancel</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null); // Firebase auth user object
  const [authChecked, setAuthChecked] = useState(false);

  const [page, setPage] = useState("home");
  const [themeId, setThemeId] = useState("pink");
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  const [selectedClass, setSelectedClass] = useState(DEFAULT_CLASSES[0].id);
  const [selectedMode, setSelectedMode] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [showClassManager, setShowClassManager] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const [profile, setProfile] = useState(null);
  const [convos, setConvos] = useState({});
  const [knowledgeCache, setKnowledgeCache] = useState({});
  const [researchingClass, setResearchingClass] = useState(null);
  const researchRef = useRef(null);
  const kbRef = useRef({});
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Thinking...");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);
  const chatEndRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [signInError, setSignInError] = useState("");

  useEffect(() => { researchRef.current = researchingClass; }, [researchingClass]);
  useEffect(() => { kbRef.current = knowledgeCache; }, [knowledgeCache]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); });

  const t = THEMES[themeId];
  const bs = mkBtn(t);
  const curClass = classes.find(c => c.id === selectedClass) || classes[0];
  const convoKey = selectedClass && selectedMode ? `${selectedClass}-${selectedMode}` : null;
  const convo = convoKey ? (convos[convoKey] || { messages: [], hintLevel: 0 }) : { messages: [], hintLevel: 0 };

  // ═══════════════════════════════════════════════════════════
  // AUTH: Listen for Firebase auth state
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      if (user) {
        setFirebaseUser(user);
        // Load user data from Firestore
        const data = await loadUserData(user.uid);
        if (data) {
          if (data.classes?.length) setClasses(data.classes);
          if (data.selected) setSelectedClass(data.selected);
          if (data.difficulty) setDifficulty(data.difficulty);
          if (data.theme && THEMES[data.theme]) setThemeId(data.theme);
          if (data.history?.length) setHistory(data.history);
          if (data.knowledge) { setKnowledgeCache(data.knowledge); kbRef.current = data.knowledge; }
          if (data.convos) setConvos(data.convos);
          if (data.profile) setProfile(data.profile);
          else setProfile({ name: user.displayName || "Student", avatar: "😊", createdAt: Date.now() });
        } else {
          // First time user — set defaults
          const newProfile = { name: user.displayName || "Student", avatar: "😊", createdAt: Date.now() };
          setProfile(newProfile);
          await saveUserData(user.uid, {
            profile: newProfile,
            classes: DEFAULT_CLASSES,
            selected: DEFAULT_CLASSES[0].id,
            difficulty: "medium",
            theme: "pink",
            history: [],
            knowledge: {},
            convos: {},
          });
        }
        setStorageLoaded(true);
        loaded.current = true;
      } else {
        setFirebaseUser(null);
        setProfile(null);
        setStorageLoaded(false);
        loaded.current = false;
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    setSignInError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error("Sign in error:", e);
      setSignInError("Sign in failed. Try again.");
    }
  };

  const handleLogout = async () => {
    await persistNow();
    try { await logOut(); } catch {}
    setClasses(DEFAULT_CLASSES);
    setSelectedClass(DEFAULT_CLASSES[0].id);
    setConvos({});
    setKnowledgeCache({});
    kbRef.current = {};
    setHistory([]);
    setThemeId("pink");
    setDifficulty("medium");
    setPage("home");
  };

  // ═══════════════════════════════════════════════════════════
  // STORAGE — saves to Firestore under user's uid
  // ═══════════════════════════════════════════════════════════
  const loaded = useRef(false);
  const classesRef = useRef(classes);
  const selectedRef = useRef(selectedClass);
  const diffRef = useRef(difficulty);
  const themeRef = useRef(themeId);
  const historyRef = useRef(history);
  const convosRef = useRef(convos);
  const profileRef = useRef(profile);

  useEffect(() => { classesRef.current = classes; }, [classes]);
  useEffect(() => { selectedRef.current = selectedClass; }, [selectedClass]);
  useEffect(() => { diffRef.current = difficulty; }, [difficulty]);
  useEffect(() => { themeRef.current = themeId; }, [themeId]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { convosRef.current = convos; }, [convos]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const buildBundle = () => ({
    profile: profileRef.current,
    classes: classesRef.current,
    selected: selectedRef.current,
    difficulty: diffRef.current,
    theme: themeRef.current,
    history: historyRef.current.slice(-30),
    knowledge: kbRef.current,
    convos: convosRef.current,
  });

  const persistNow = async () => {
    if (!firebaseUser || !loaded.current) return;
    await saveUserData(firebaseUser.uid, buildBundle());
  };

  const persistTimer = useRef(null);
  const persist = useCallback(() => {
    if (!loaded.current || !firebaseUser) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      await persistNow();
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus(""), 2000);
    }, 3000);
  }, [firebaseUser]);

  // Research
  useEffect(() => {
    if (!storageLoaded || !selectedClass || !curClass) return;
    const cached = knowledgeCache[selectedClass];
    if (cached && (Date.now() - cached.ts) < 3600000) return;
    let dead = false;
    (async () => {
      setResearchingClass(selectedClass); researchRef.current = selectedClass;
      try {
        const data = await researchClass(curClass.name);
        if (!dead) { setKnowledgeCache(p => { const u = { ...p, [selectedClass]: { data, ts: Date.now() } }; kbRef.current = u; return u; }); }
      } catch {}
      if (!dead) { setResearchingClass(null); researchRef.current = null; setTimeout(persist, 100); }
    })();
    return () => { dead = true; };
  }, [selectedClass, storageLoaded]);

  const waitKb = async () => {
    const start = Date.now();
    while (researchRef.current === selectedClass && Date.now() - start < 20000) await new Promise(r => setTimeout(r, 300));
    return kbRef.current[selectedClass]?.data || "";
  };

  const buildContent = (txt, atts) => {
    const c = [];
    (atts || []).filter(a => a.type === "image" && a.base64).forEach(a => c.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.base64 } }));
    const ftxt = (atts || []).filter(a => a.type === "file" && a.textContent).map(a => `\n--- ${a.name} ---\n${a.textContent}`).join("");
    c.push({ type: "text", text: (txt + ftxt) || "Analyze the attached image(s)." });
    return c;
  };

  const updateConvo = (key, updater) => setConvos(p => ({ ...p, [key]: updater(p[key] || { messages: [], hintLevel: 0 }) }));

  const send = async () => {
    if ((!input.trim() && !attachments.length) || loading || !convoKey) return;
    const userMsg = { role: "user", text: input, attachments: attachments.length ? attachments : undefined };
    updateConvo(convoKey, c => ({ ...c, messages: [...c.messages, userMsg] }));
    const myInput = input; const myAtts = [...attachments];
    setInput(""); setAttachments([]); setLoading(true);

    let kb = kbRef.current[selectedClass]?.data || "";
    if (researchRef.current === selectedClass) { setLoadingMsg(`Loading ${dn(curClass)}...`); kb = await waitKb(); }
    setLoadingMsg("Thinking...");
    const cn = curClass.name; const key = convoKey;

    try {
      if (selectedMode === "quiz") {
        const prefix = myInput ? `Generate a quiz about: ${myInput}` : "Generate a quiz from the attached material.";
        const r = await askClaudeRaw(PROMPTS.quiz(difficulty, cn, kb), buildContent(prefix, myAtts));
        try { const qd = JSON.parse(r.replace(/```json?|```/g, "").trim()); updateConvo(key, c => ({ ...c, messages: [...c.messages, { role: "assistant", text: "", quizData: qd }] })); }
        catch { updateConvo(key, c => ({ ...c, messages: [...c.messages, { role: "assistant", text: "Couldn't generate quiz. Try again!" }] })); }
      } else if (selectedMode === "hint") {
        const curConvo = convos[key] || { messages: [], hintLevel: 0 };
        const newLvl = Math.min((curConvo.hintLevel || 0) + 1, 4);
        if (newLvl <= 3) { const r = await askClaudeRaw(PROMPTS.hint(newLvl, cn, kb), buildContent(myInput, myAtts)); updateConvo(key, c => ({ ...c, hintLevel: newLvl, messages: [...c.messages, { role: "assistant", text: `**Hint ${newLvl}:**\n${r}` }] })); }
        else { const r = await askClaudeRaw(PROMPTS.explain("easy", cn, kb), buildContent(myInput, myAtts)); updateConvo(key, c => ({ ...c, hintLevel: newLvl, messages: [...c.messages, { role: "assistant", text: `**Full Answer:**\n${r}` }] })); }
      } else {
        const prompt = selectedMode === "babyfy" ? PROMPTS.babyfy(cn, kb) : selectedMode === "stepbystep" ? PROMPTS.stepByStep(cn, kb) : PROMPTS.explain(difficulty, cn, kb);
        const curConvo = convos[key] || { messages: [] };
        const apiMsgs = [];
        [...curConvo.messages, userMsg].forEach(m => {
          if (m.role === "user") apiMsgs.push({ role: "user", content: buildContent(m.text, m.attachments) });
          else if (m.role === "assistant" && m.text) apiMsgs.push({ role: "assistant", content: m.text });
        });
        const r = await askClaudeRaw(prompt, apiMsgs);
        updateConvo(key, c => ({ ...c, messages: [...c.messages, { role: "assistant", text: r }] }));
      }
      setHistory(h => {
        const entry = { classId: selectedClass, modeId: selectedMode, preview: myInput.slice(0, 60) || "(attachment)", ts: Date.now() };
        return [...h.filter(x => !(x.classId === entry.classId && x.modeId === entry.modeId && x.preview === entry.preview)), entry];
      });
    } catch { updateConvo(key, c => ({ ...c, messages: [...c.messages, { role: "assistant", text: "Something went wrong. Try again!" }] })); }
    setLoading(false);
    setTimeout(persist, 100);
  };

  const onFiles = async (e) => {
    for (const f of Array.from(e.target.files)) {
      if (f.type.startsWith("image/")) { const b = await readFileAsBase64(f); setAttachments(p => [...p, { name: f.name, type: "image", base64: b, previewUrl: URL.createObjectURL(f) }]); }
      else { try { const txt = await readFileAsText(f); setAttachments(p => [...p, { name: f.name, type: "file", textContent: txt }]); } catch {} }
    }
    e.target.value = "";
  };

  const clearConvo = () => { if (convoKey) { updateConvo(convoKey, () => ({ messages: [], hintLevel: 0 })); setTimeout(persist, 100); } };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    textarea:focus,input:focus,select:focus{outline:2px solid ${t.accentLight};outline-offset:-1px}
    ::placeholder{color:${t.textMuted}}
    ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${t.border};border-radius:3px}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .grad-title{background:linear-gradient(135deg,${t.titleFrom},${t.titleTo});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
  `;

  // Loading
  if (!authChecked) return <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit',system-ui,sans-serif" }}>
    <style>{globalStyles}</style>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
      <span style={{ display: "inline-block", width: 20, height: 20, border: `3px solid ${t.border}`, borderTopColor: t.accent, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
    </div>
  </div>;

  // Not logged in — Google sign in screen
  if (!firebaseUser) return <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Outfit','DM Sans',system-ui,sans-serif", display: "flex", justifyContent: "center" }}>
    <style>{globalStyles}</style>
    <div style={{ width: "100%", maxWidth: 540, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ flex: 1, padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeIn .3s ease" }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>📚</div>
          <h1 className="grad-title" style={{ fontSize: 28, fontWeight: 800, marginBottom: 2 }}>AI Study Buddy</h1>
          <p style={{ color: t.textMuted, fontSize: 13, marginBottom: 32 }}>Sign in to save your classes, quizzes, and progress across all your devices</p>

          {signInError && <div style={{ padding: "8px 12px", background: `${t.red}12`, border: `1px solid ${t.red}30`, borderRadius: 10, marginBottom: 14, fontSize: 13, color: t.red, fontWeight: 600 }}>{signInError}</div>}

          <button onClick={handleGoogleSignIn} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            width: "100%", padding: "14px 20px", borderRadius: 14, fontSize: 16, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
            background: "#fff", color: "#333", border: "1.5px solid #ddd",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>
        </div>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: t.textMuted, padding: "8px 0 16px" }}>Powered by Claude AI {t.decoChar}</p>
    </div>
  </div>;

  // Logged in — main app
  return <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Outfit','DM Sans',system-ui,sans-serif", display: "flex", justifyContent: "center" }}>
    <style>{globalStyles}</style>
    <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp" style={{ display: "none" }} onChange={onFiles} />

    {showClassManager && <ClassManager classes={classes} t={t} onClose={() => setShowClassManager(false)} onSave={(c, reIds) => {
      setClasses(c); if (!c.find(x => x.id === selectedClass) && c.length) setSelectedClass(c[0].id);
      if (reIds?.length) setKnowledgeCache(p => { const u = { ...p }; reIds.forEach(id => delete u[id]); kbRef.current = u; return u; });
      setShowClassManager(false); setTimeout(persist, 100);
    }} />}
    {showCamera && <CameraModal t={t} onCapture={a => setAttachments(p => [...p, a])} onClose={() => setShowCamera(false)} />}

    {showThemePicker && <div style={{ position: "fixed", inset: 0, zIndex: 900 }} onClick={() => setShowThemePicker(false)}>
      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 56, right: 20, background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 14, padding: 8, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", minWidth: 180 }}>
        {Object.values(THEMES).map(th => <button key={th.id} onClick={() => { setThemeId(th.id); setShowThemePicker(false); setTimeout(persist, 100); }} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 10,
          background: themeId === th.id ? t.surfaceAlt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: t.text, fontWeight: themeId === th.id ? 700 : 400,
        }}><span style={{ fontSize: 18 }}>{th.emoji}</span>{th.label} {th.decoChar}</button>)}
      </div>
    </div>}

    <div style={{ width: "100%", maxWidth: 540, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {page === "edit-profile" && <ProfileEditor t={t} profile={profile} onSave={(p) => { setProfile(p); setPage("home"); setTimeout(persist, 100); }} />}

      {page === "home" && <div style={{ flex: 1, padding: "20px 14px", animation: "fadeIn .25s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <h1 className="grad-title" style={{ fontSize: 26, fontWeight: 800 }}>AI Study Buddy <span style={{ fontSize: 12, fontWeight: 500, WebkitTextFillColor: t.accent, color: t.accent }}>v3.0</span></h1>
            {profile && <button onClick={() => setPage("edit-profile")} style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 20, padding: "4px 12px 4px 8px", fontSize: 12, color: t.text, cursor: "pointer", fontFamily: "inherit", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 14 }}>{profile.avatar}</span>
              <span style={{ fontWeight: 600 }}>{profile.name}</span>
              <span style={{ color: t.textMuted, fontSize: 10 }}>✎</span>
            </button>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {syncStatus && <span style={{ fontSize: 11, color: t.green, fontWeight: 600 }}>✓</span>}
            <button onClick={() => setShowThemePicker(!showThemePicker)} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, width: 38, height: 38, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: t.shadow }}>{t.decoChar}</button>
            <button onClick={handleLogout} title="Log out" style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 12, width: 38, height: 38, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: t.shadow }}>🚪</button>
          </div>
        </div>

        <div style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: "6px 12px", marginBottom: 14, fontSize: 11, color: t.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
          {firebaseUser.photoURL && <img src={firebaseUser.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />}
          <span>Signed in as <strong style={{ color: t.accent }}>{firebaseUser.email}</strong></span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {classes.map(c => <button key={c.id} onClick={() => { setSelectedClass(c.id); setPage("modes"); }} style={{
            background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 16, padding: "20px 14px",
            cursor: "pointer", textAlign: "center", fontFamily: "inherit", boxShadow: t.cardShadow, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 6, right: 8, fontSize: 10, opacity: 0.3 }}>{t.decoChar}</div>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{dn(c)}</div>
            {knowledgeCache[c.id] ? <div style={{ fontSize: 10, color: t.green, marginTop: 4 }}>✓ Ready</div>
              : researchingClass === c.id ? <div style={{ fontSize: 10, color: t.accent, marginTop: 4 }}>Loading...</div>
              : <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>Tap to start</div>}
          </button>)}
        </div>

        <button onClick={() => setShowClassManager(true)} style={{ ...bs, width: "100%", padding: "12px", background: t.surfaceAlt, color: t.accent, border: `1.5px dashed ${t.border}`, boxShadow: "none" }}>✏️ Manage Classes</button>

        {history.length > 0 && <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Recent {t.decoChar}</p>
          {history.slice(-8).reverse().map((h, i) => {
            const cls = classes.find(c => c.id === h.classId);
            const mode = MODES.find(m => m.id === h.modeId);
            return <button key={i} onClick={() => { setSelectedClass(h.classId); setSelectedMode(h.modeId); setPage("chat"); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 10,
              background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: t.textMuted, textAlign: "left", marginBottom: 2,
            }}>
              <span>{mode?.icon}</span>
              <span style={{ flex: 1 }}>{cls?.icon} {h.preview}</span>
              <span style={{ fontSize: 10, opacity: 0.5 }}>{new Date(h.ts).toLocaleDateString()}</span>
            </button>;
          })}
        </div>}
      </div>}

      {page === "modes" && <div style={{ flex: 1, padding: "20px 14px", animation: "fadeIn .25s ease" }}>
        <button onClick={() => setPage("home")} style={{ background: "none", border: "none", color: t.accent, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, marginBottom: 14 }}>← Classes</button>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{curClass?.icon}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>{dn(curClass)}</h2>
          {researchingClass === selectedClass && <p style={{ fontSize: 12, color: t.accent, marginTop: 4 }}><span style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${t.accentLight}`, borderTopColor: t.accent, borderRadius: "50%", animation: "spin .8s linear infinite", verticalAlign: "middle", marginRight: 4 }} />Learning curriculum...</p>}
          {knowledgeCache[selectedClass] && researchingClass !== selectedClass && <p style={{ fontSize: 12, color: t.green, marginTop: 4 }}>✓ Knowledge loaded</p>}
        </div>
        <p style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Difficulty</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {["easy","medium","hard"].map(d => <button key={d} onClick={() => { setDifficulty(d); setTimeout(persist, 100); }} style={{
            flex: 1, padding: "8px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", textTransform: "capitalize",
            background: difficulty === d ? `linear-gradient(135deg, ${t.accent}, ${t.accentLight})` : t.surface,
            color: difficulty === d ? "#fff" : t.textMuted, border: `1.5px solid ${difficulty === d ? t.accent : t.border}`,
          }}>{d}</button>)}
        </div>
        <p style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Choose a mode {t.decoChar}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MODES.map(m => {
            const key = `${selectedClass}-${m.id}`;
            const hasConvo = convos[key]?.messages?.length > 0;
            return <button key={m.id} onClick={() => { setSelectedMode(m.id); setPage("chat"); }} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px", background: t.surface,
              border: `1.5px solid ${t.border}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
              boxShadow: t.cardShadow, textAlign: "left", position: "relative",
            }}>
              <span style={{ fontSize: 26 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{m.label}</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                  {m.id === "explain" ? "Step-by-step solutions & explanations" : m.id === "hint" ? "Progressive hints — 3 levels before answer" : m.id === "quiz" ? "3-question quiz on any topic" : m.id === "babyfy" ? "Explain it like I'm 12" : "Guided Socratic method learning"}
                </div>
              </div>
              {hasConvo && <span style={{ fontSize: 10, color: t.accent, position: "absolute", top: 8, right: 10 }}>{t.decoChar}</span>}
            </button>;
          })}
        </div>
      </div>}

      {page === "chat" && <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${t.border}`, background: t.surface, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setPage("modes")} style={{ background: "none", border: "none", color: t.accent, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{curClass?.icon} {dn(curClass)}</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>{MODES.find(m => m.id === selectedMode)?.icon} {MODES.find(m => m.id === selectedMode)?.label} · {difficulty}</div>
          </div>
          <button onClick={clearConvo} style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: t.accent, cursor: "pointer", fontFamily: "inherit" }}>New {t.decoChar}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
          {convo.messages.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: t.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{MODES.find(m => m.id === selectedMode)?.icon}</div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{MODES.find(m => m.id === selectedMode)?.label} Mode</p>
            <p style={{ fontSize: 13 }}>
              {selectedMode === "explain" ? "Ask a question and I'll walk you through it!" : selectedMode === "hint" ? "Paste a problem — I'll give you 3 hints before the answer." : selectedMode === "quiz" ? "Give me a topic or upload notes for a quiz!" : selectedMode === "babyfy" ? "Ask anything and I'll explain it super simply!" : "Ask a question and I'll guide you through solving it!"}
            </p>
          </div>}
          {convo.messages.map((m, i) => <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", animation: "slideUp .2s ease" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: m.role === "user" ? `linear-gradient(135deg, ${t.accent}, ${t.accentLight})` : t.surface,
              color: m.role === "user" ? "#fff" : t.text,
              border: m.role === "user" ? "none" : `1px solid ${t.border}`,
              boxShadow: m.role === "user" ? `0 2px 8px ${t.accentGlow}` : t.shadow, fontSize: 14,
            }}>
              {m.attachments?.map((a, j) => <div key={j} style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                {a.previewUrl ? <img src={a.previewUrl} alt="" style={{ maxWidth: 120, borderRadius: 8, marginBottom: 4, display: "block" }} /> : `📎 ${a.name}`}
              </div>)}
              {m.text && m.role === "user" && <span>{m.text}</span>}
              {m.text && m.role === "assistant" && <Md text={m.text} t={t} />}
              {m.quizData && <QuizView quizData={m.quizData} t={t} onFinish={() => {}} />}
            </div>
          </div>)}
          {loading && <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: t.surface, border: `1px solid ${t.border}`, fontSize: 13, color: t.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${t.border}`, borderTopColor: t.accent, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
              {loadingMsg}
            </div>
          </div>}
          {selectedMode === "hint" && convo.messages.length > 0 && convo.hintLevel > 0 && convo.hintLevel < 3 && !loading && <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => { setInput(convo.messages.find(m => m.role === "user")?.text || ""); setTimeout(send, 50); }} style={{ ...bs, flex: 1, fontSize: 12, padding: "8px" }}>💡 Hint {convo.hintLevel + 1}</button>
            <button onClick={() => { updateConvo(convoKey, c => ({ ...c, hintLevel: 3 })); setInput(convo.messages.find(m => m.role === "user")?.text || ""); setTimeout(send, 50); }} style={{ ...bs, flex: 1, fontSize: 12, padding: "8px", background: `${t.red}15`, color: t.red, border: `1px solid ${t.red}30`, boxShadow: "none" }}>Show Answer</button>
          </div>}
          <div ref={chatEndRef} />
        </div>
        <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${t.border}`, background: t.surface }}>
          {attachments.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {attachments.map((a, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 8px", fontSize: 11 }}>
              {a.previewUrl ? <img src={a.previewUrl} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} /> : "📄"}
              <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
            </div>)}
          </div>}
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <button onClick={() => setShowCamera(true)} style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📷</button>
            <button onClick={() => fileRef.current?.click()} style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📎</button>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={selectedMode === "quiz" ? "Topic or upload notes..." : "Type your question..."}
              rows={1} style={{ flex: 1, background: t.surfaceAlt, border: `1.5px solid ${t.border}`, borderRadius: 12, padding: "9px 12px", color: t.text, fontSize: 14, fontFamily: "inherit", resize: "none", lineHeight: 1.4 }} />
            <button onClick={send} disabled={loading || (!input.trim() && !attachments.length)} style={{ ...bs, padding: "9px 14px", flexShrink: 0, opacity: loading || (!input.trim() && !attachments.length) ? 0.5 : 1, borderRadius: 10 }}>{t.decoChar}</button>
          </div>
        </div>
      </div>}

      {page !== "chat" && <p style={{ textAlign: "center", fontSize: 11, color: t.textMuted, padding: "8px 0 16px" }}>Powered by Claude AI {t.decoChar}</p>}
    </div>
  </div>;
}