import { useState, useReducer, useMemo, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { createClient } from "@supabase/supabase-js";

/* ═══════════════════════════════════════════════════════════════════════════
   BAHI KHATA — a personal ledger
   Palette: cool paper, deep ink, emerald, brass, oxblood
   Type: Fraunces (display figures) · IBM Plex Sans (body) · IBM Plex Mono (data)
   Signature: hairline rules + right-aligned monospace figure column
   ═══════════════════════════════════════════════════════════════════════════ */

const LIGHT = {
  paper:  "#EEF1EC",
  panel:  "#FFFFFF",
  panel2: "#F7F9F6",
  rule:   "#DCE3DC",
  rule2:  "#C8D2C8",
  ink:    "#16211D",
  ink2:   "#46554F",
  ink3:   "#7A8A84",
  ink4:   "#A3AFA9",
  emerald:"#1B6B54",
  em2:    "#2A8A6E",
  emSoft: "#E4EFE9",
  brass:  "#9A7B1F",
  brSoft: "#F5EEDC",
  oxblood:"#A33B2C",
  oxSoft: "#F7E7E4",
  slate:  "#2C5F8A",
  slSoft: "#E5EDF4",
};

const DARK = {
  paper:  "#14181A",
  panel:  "#1B2124",
  panel2: "#20272A",
  rule:   "#2C3538",
  rule2:  "#3A454A",
  ink:    "#EDEFEA",
  ink2:   "#B7C0BC",
  ink3:   "#828D8A",
  ink4:   "#5C6663",
  emerald:"#3FA383",
  em2:    "#4FBF9A",
  emSoft: "#1D3A31",
  brass:  "#D4AC4E",
  brSoft: "#3A331B",
  oxblood:"#E0705C",
  oxSoft: "#3D211D",
  slate:  "#6FA3D6",
  slSoft: "#1E2E3D",
};

// C is a live-bound palette object — toggleTheme() mutates its keys in place
// so every module-level component (defined outside App) that closes over C
// re-reads the current theme without needing C threaded through props.
const C = { ...LIGHT };
let themeListeners = [];
function applyTheme(mode){
  const src = mode === "dark" ? DARK : LIGHT;
  Object.keys(src).forEach(k => { C[k] = src[k]; });
  themeListeners.forEach(fn => fn());
}
function useThemeSync(){
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    themeListeners.push(fn);
    return () => { themeListeners = themeListeners.filter(f => f !== fn); };
  }, []);
}

/* ══════════════════════════════════════════════════════════════════════════
   AD SLOTS — self-contained, no access to ledger state, no side effects
   on data, storage, or the reducer. Safe to add/remove/reposition freely.

   HOW TO GO LIVE:
   1. Set ADSENSE_CLIENT below to your own AdSense publisher id
      (looks like "ca-pub-XXXXXXXXXXXXXXXX").
   2. Give each <AdSlot> a real slot id from your AdSense dashboard.
   3. Add the AdSense loader script to your page's <head> once:
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
   Inside this Claude artifact the script cannot load (sandboxed), so slots
   render as a labeled placeholder instead — that's expected here and will
   resolve automatically once this is hosted on your own domain.
   ══════════════════════════════════════════════════════════════════════════ */
const ADSENSE_CLIENT = ""; // e.g. "ca-pub-1234567890123456" — leave blank while testing

function AdSlot({ slotId = "0000000000", format = "auto", label = "Advertisement", style = {} }){
  useThemeSync();
  const ref = useState(() => "ad_" + Math.random().toString(36).slice(2))[0];
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT) return; // no publisher id set — stay in placeholder mode
    try {
      if (window.adsbygoogle) {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
        setLive(true);
      }
    } catch (e) { /* AdSense script not present in this environment — placeholder stays visible */ }
  }, []);

  return (
    <div style={{ margin: "4px 0", ...style }}>
      <div style={{ fontSize: 9, color: C.ink4, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5, textAlign: "center" }}>{label}</div>
      {ADSENSE_CLIENT ? (
        <ins className="adsbygoogle"
          style={{ display: "block", background: C.panel2, borderRadius: 8, minHeight: 90 }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slotId}
          data-ad-format={format}
          data-full-width-responsive="true" />
      ) : (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: C.panel2, border: `1px dashed ${C.rule2}`, borderRadius: 8,
          minHeight: 90, color: C.ink4, fontSize: 11
        }}>
          Ad space · {slotId}
        </div>
      )}
    </div>
  );
}

const PIE = ["#1B6B54","#9A7B1F","#2C5F8A","#A33B2C","#5B7C6E","#B08D3E","#4A7BA0","#7D5A52","#3E8E75","#8B6F47"];
const ACCT_COLORS = ["#1B6B54","#9A7B1F","#2C5F8A","#A33B2C","#5B7C6E","#B08D3E","#4A7BA0","#7D5A52","#3E8E75","#8B6F47"];

const CAT_ICONS = {
  "PTCL Bill":"📡","IESCO Bill":"⚡","SNGPL Bill":"🔥","M-TAG":"🛣️","Mobile Load & Packages":"📱",
  "YouTube Premium":"▶️","Claude (Anthropic)":"🤖","Netflix":"🎬","Subscription — Other":"📦",
  "Hostel Rent":"🏠","Hostel Electricity":"💡","School Fee":"🎓",
  "Family Support / Rishtedar":"❤️","Family Transfer Received":"💌",
  "Food & Dining":"🍽️","Groceries":"🛒","Transport & Travel":"🚗","Petrol / CNG":"⛽",
  "Clothing & Shoes":"👗","Health & Medical":"🏥","Medicines":"💊","Haircut & Grooming":"✂️","Entertainment":"🎮",
  "Mobile Repair & Accessories":"🔧","Software / Apps":"💻",
  "Eid / Gift / Sadqa":"🎁","Wedding / Function":"💍",
  "Investment":"📈","Loan Payment":"💳","Zakat / Charity":"🌙","Tax Payment":"📋","Bank Charges & Fees":"🏦",
  "Transfer":"↔️","Income":"💰","Miscellaneous":"📌",
};
const DEFAULT_CATS = Object.keys(CAT_ICONS);

// Every new user starts with an empty ledger — no seeded accounts or
// transactions. Users add their own accounts via the "Add account" sheet.
const INIT_ACCS = [];
const INIT_TXS = [];
const CORE_IDS = new Set(INIT_ACCS.map(a=>a.id));

// Balances are computed by folding every transaction onto each account's
// own opening balance (set at creation time), so this works for any set
// of accounts a user creates — not just a fixed baked-in list.
function recalc(accounts, allTxs){
  const b={};accounts.forEach(a=>{b[a.id]=a.opening ?? a.balance ?? 0;});
  allTxs.forEach(t=>{
    if(t.type==="transfer"){if(t.from&&b[t.from]!==undefined)b[t.from]-=t.amount;if(t.to&&b[t.to]!==undefined)b[t.to]+=t.amount;}
    else if(t.type==="expense"){if(t.from&&b[t.from]!==undefined)b[t.from]-=t.amount;}
    else if(t.type==="income"){if(t.to&&b[t.to]!==undefined)b[t.to]+=t.amount;}
  });
  return b;
}
function applyBalMap(accounts,txs){const m=recalc(accounts,txs);return accounts.map(a=>m[a.id]!==undefined?{...a,balance:m[a.id]}:a);}

function reducer(state,action){
  switch(action.type){
    case "ADD_TX":{const txs=[{...action.p,id:Date.now()},...state.txs];return{...state,txs,accounts:applyBalMap(state.accounts,txs)};}
    case "EDIT_TX":{const txs=state.txs.map(t=>String(t.id)===String(action.p.id)?action.p:t);return{...state,txs,accounts:applyBalMap(state.accounts,txs)};}
    case "DEL_TX":{const txs=state.txs.filter(t=>String(t.id)!==String(action.id));return{...state,txs,accounts:applyBalMap(state.accounts,txs)};}
    case "ADD_ACC":return{...state,accounts:[...state.accounts,action.p]};
    case "DEL_ACC":return{...state,accounts:state.accounts.filter(a=>a.id!==action.id)};
    case "SET_BAL":{
      const acc=state.accounts.find(a=>a.id===action.id);if(!acc)return state;
      const diff=action.bal-acc.balance;if(Math.abs(diff)<0.001)return state;
      const adj={id:Date.now(),date:new Date().toISOString().slice(0,10),desc:`Balance correction — ${acc.name}`,amount:Math.abs(diff),type:diff>0?"income":"expense",category:"Miscellaneous",from:diff<0?action.id:null,to:diff>0?action.id:null,isAdj:true};
      const txs=[adj,...state.txs];return{...state,txs,accounts:applyBalMap(state.accounts,txs)};
    }
    case "LOAD_TXS":{const m=recalc(state.accounts,action.txs);return{...state,txs:action.txs,accounts:state.accounts.map(a=>m[a.id]!==undefined?{...a,balance:m[a.id]}:a)};}
    case "LOAD_ACCS":return{...state,accounts:action.accs};
    default:return state;
  }
}

/* ── Figures: always full digits, tabular, monospace ── */
const NUM = n=>{const a=Math.abs(n);return a.toLocaleString("en-PK",{minimumFractionDigits:a%1!==0?2:0,maximumFractionDigits:2});};
const fmt = n=>(n<0?"−":"")+"Rs "+NUM(n);
const today=()=>new Date().toISOString().slice(0,10);

// Storage keys are namespaced per-user so multiple accounts never collide.
// userId comes from auth (see AUTH section below) — "guest" is the fallback
// used before anyone signs in, or while running with no backend attached.
const skFor = (userId, name) => `khata:${userId || "guest"}:${name}:v4`;

/* ══════════════════════════════════════════════════════════════════════════
   BACKEND — Supabase when VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are set,
   otherwise a localStorage-backed mock so the app still runs standalone.
   ══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Data storage adapter — every caller in this file goes through ss()/sl().
// With Supabase configured, reads/writes go to a per-row `khata_kv` table
// (key text primary key, value jsonb) scoped by RLS to auth.uid(); the app
// already namespaces every key with the user's id via skFor(), so a single
// shared table works fine. Without Supabase, falls back to localStorage.
async function ss(k,v){
  try{
    if(hasSupabase){
      const { error } = await supabase.from("khata_kv").upsert({ key: k, value: v });
      if(error) throw error;
    } else {
      localStorage.setItem(k, JSON.stringify(v));
    }
  }catch(e){}
}
async function sl(k){
  try{
    if(hasSupabase){
      const { data, error } = await supabase.from("khata_kv").select("value").eq("key", k).maybeSingle();
      if(error) throw error;
      return data?.value ?? null;
    }
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

/* ══════════════════════════════════════════════════════════════════════════
   AUTH — signup / login / logout.

   With Supabase configured, this uses real Supabase Auth (email/password).
   Without it, falls back to a MOCK auth backed by localStorage — accounts
   and password hashes are stored under a fixed "khata:__auth__" key. That
   mock is NOT real security (non-cryptographic hash, client-side only);
   it exists purely so the app runs standalone before a backend is wired.
   ══════════════════════════════════════════════════════════════════════════ */

const AUTH_TABLE_KEY = "khata:__auth__accounts";
const AUTH_SESSION_KEY = "khata:__auth__session";

// Simple non-cryptographic hash — placeholder only, used by the mock auth
// fallback when no Supabase project is configured.
function mockHash(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = ((h<<5)-h + str.charCodeAt(i)) | 0; }
  return String(h);
}

const MOCK_AUTH_BACKEND = {
  async signUp(email, password){
    email = email.trim().toLowerCase();
    if(!email || !password) throw new Error("Email and password are required.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if(password.length < 6) throw new Error("Password must be at least 6 characters.");
    const table = JSON.parse(localStorage.getItem(AUTH_TABLE_KEY) || "{}");
    if(table[email]) throw new Error("An account with this email already exists.");
    const id = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    table[email] = { id, email, passHash: mockHash(password) };
    localStorage.setItem(AUTH_TABLE_KEY, JSON.stringify(table));
    const session = { id, email };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  },
  async signIn(email, password){
    email = email.trim().toLowerCase();
    const table = JSON.parse(localStorage.getItem(AUTH_TABLE_KEY) || "{}");
    const rec = table[email];
    if(!rec || rec.passHash !== mockHash(password)) throw new Error("Incorrect email or password.");
    const session = { id: rec.id, email: rec.email };
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  },
  async signOut(){
    localStorage.removeItem(AUTH_SESSION_KEY);
  },
  async currentSession(){
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },
};

const SUPABASE_AUTH_BACKEND = {
  async signUp(email, password){
    const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
    if(error) throw new Error(error.message);
    if(!data.session) throw new Error("Account created — check your email to confirm before signing in.");
    return { id: data.user.id, email: data.user.email };
  },
  async signIn(email, password){
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if(error) throw new Error(error.message);
    return { id: data.user.id, email: data.user.email };
  },
  async signOut(){
    await supabase.auth.signOut();
  },
  async currentSession(){
    const { data } = await supabase.auth.getSession();
    if(!data.session) return null;
    return { id: data.session.user.id, email: data.session.user.email };
  },
};

const AUTH_BACKEND = hasSupabase ? SUPABASE_AUTH_BACKEND : MOCK_AUTH_BACKEND;

/* ── Shared JSON extractor: brace-matching, string-aware ── */
function extractJSON(text){
  if(!text) return null;
  const s = text.replace(/```json/gi,"").replace(/```/g,"").trim();
  const start = s.indexOf("{");
  if(start === -1) return null;
  let depth=0, inStr=false, esc=false;
  for(let i=start; i<s.length; i++){
    const ch = s[i];
    if(esc){ esc=false; continue; }
    if(ch === "\\"){ esc=true; continue; }
    if(ch === '"'){ inStr=!inStr; continue; }
    if(inStr) continue;
    if(ch === "{") depth++;
    else if(ch === "}"){
      depth--;
      if(depth === 0){
        try { return JSON.parse(s.slice(start, i+1)); } catch(e){ return null; }
      }
    }
  }
  return null;
}

/* ── Shared Claude call with retries and real error surfacing ── */
async function callClaude(body, maxAttempts=3){
  let lastErr = "";
  for(let attempt=1; attempt<=maxAttempts; attempt++){
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify(body)
      });
      if(!res.ok){
        let detail="";
        try{ const eb=await res.json(); detail = eb?.error?.message || JSON.stringify(eb).slice(0,180); }
        catch(_){ try{ detail=(await res.text()).slice(0,180); }catch(__){} }
        lastErr = `HTTP ${res.status}${detail?": "+detail:""}`;
        if(attempt<maxAttempts){ await new Promise(r=>setTimeout(r, attempt*900)); continue; }
        throw new Error(lastErr);
      }
      const data = await res.json();
      if(data.error){
        lastErr = data.error.message || "API error";
        if(attempt<maxAttempts){ await new Promise(r=>setTimeout(r, attempt*900)); continue; }
        throw new Error(lastErr);
      }
      return data;
    }catch(e){
      lastErr = e.message || "Request failed";
      if(attempt===maxAttempts) throw new Error(lastErr);
      await new Promise(r=>setTimeout(r, attempt*900));
    }
  }
  throw new Error(lastErr || "Failed");
}

/* ── Ledger primitives ── */
const mono = {fontFamily:"'IBM Plex Mono',ui-monospace,monospace",fontVariantNumeric:"tabular-nums"};
const disp = {fontFamily:"'Fraunces',Georgia,serif"};

function Eyebrow({children,color=C.ink3,style={}}){
  return <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color,...style}}>{children}</div>;
}

function Panel({children,style={},pad=18}){
  return <div style={{background:C.panel,border:`1px solid ${C.rule}`,borderRadius:10,padding:pad,...style}}>{children}</div>;
}

function Rule({style={}}){return <div style={{height:1,background:C.rule,...style}}/>;}

function Figure({value,size=15,weight=600,color,positive}){
  const c = color || (value<0?C.oxblood:C.ink);
  return <span style={{...mono,fontSize:size,fontWeight:weight,color:c,letterSpacing:"-0.01em",whiteSpace:"nowrap"}}>{positive&&value>0?"+":""}{fmt(value)}</span>;
}

function Tag({children,tone="ink"}){
  const map={ink:[C.ink3,C.panel2],em:[C.emerald,C.emSoft],br:[C.brass,C.brSoft],ox:[C.oxblood,C.oxSoft],sl:[C.slate,C.slSoft]};
  const [fg,bg]=map[tone]||map.ink;
  return <span style={{background:bg,color:fg,fontSize:9,fontWeight:700,padding:"3px 7px",borderRadius:4,letterSpacing:"0.1em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{children}</span>;
}

function TxMark({type}){
  const map={income:[C.emerald,C.emSoft,"↓"],expense:[C.oxblood,C.oxSoft,"↑"],transfer:[C.slate,C.slSoft,"⇄"]};
  const [fg,bg,ch]=map[type]||map.expense;
  return <div style={{width:30,height:30,borderRadius:6,background:bg,color:fg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0}}>{ch}</div>;
}

/* ── Sheet ── */
function Sheet({title,onClose,children}){
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(22,33,29,0.32)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.paper,borderRadius:"14px 14px 0 0",width:"100%",maxWidth:640,maxHeight:"92vh",overflowY:"auto",borderTop:`3px solid ${C.emerald}`,boxShadow:"0 -20px 60px rgba(22,33,29,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 22px 14px"}}>
          <span style={{...disp,fontWeight:600,fontSize:20,letterSpacing:"-0.01em",color:C.ink}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${C.rule2}`,color:C.ink2,borderRadius:6,width:30,height:30,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <Rule/>
        <div style={{padding:"18px 22px 26px"}}>{children}</div>
      </div>
    </div>
  );
}

const SI=(extra={})=>({background:C.panel,border:`1px solid ${C.rule2}`,color:C.ink,borderRadius:7,padding:"11px 13px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'IBM Plex Sans',system-ui,sans-serif",...extra});
function Field({label,children}){return <div><Eyebrow style={{marginBottom:7}}>{label}</Eyebrow>{children}</div>;}

/* ── Inline transaction editor ── */
function TxEditor({tx,accounts,cats,onSave,onCancel}){
  const [d,setD]=useState({...tx,amount:String(tx.amount)});
  const [err,setErr]=useState("");
  function save(){const a=parseFloat(d.amount);if(!d.desc.trim())return setErr("Add a description.");if(!a||a<=0)return setErr("Enter an amount above zero.");if(d.type==="transfer"&&d.from===d.to)return setErr("Pick two different accounts.");onSave({...d,amount:a});}
  const si=SI({padding:"9px 11px",fontSize:13,background:C.panel});
  return(
    <div style={{background:C.panel,border:`1px solid ${C.emerald}`,borderLeft:`3px solid ${C.emerald}`,borderRadius:8,padding:15,display:"flex",flexDirection:"column",gap:11}}>
      <div style={{display:"flex",gap:0,border:`1px solid ${C.rule2}`,borderRadius:6,overflow:"hidden"}}>
        {["expense","income","transfer"].map((t,i)=>(
          <button key={t} onClick={()=>setD(p=>({...p,type:t}))} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",borderLeft:i?`1px solid ${C.rule2}`:"none",background:d.type===t?C.emerald:C.panel,color:d.type===t?"#fff":C.ink3,textTransform:"capitalize",letterSpacing:"0.03em"}}>{t}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:9}}>
        <div style={{flex:2}}><Eyebrow style={{marginBottom:5,fontSize:9}}>Description</Eyebrow><input value={d.desc} onChange={e=>setD(p=>({...p,desc:e.target.value}))} style={si}/></div>
        <div style={{flex:1}}><Eyebrow style={{marginBottom:5,fontSize:9}}>Amount</Eyebrow><input type="number" value={d.amount} onChange={e=>setD(p=>({...p,amount:e.target.value}))} style={{...si,...mono}}/></div>
      </div>
      <div style={{display:"flex",gap:9}}>
        <div style={{flex:1}}><Eyebrow style={{marginBottom:5,fontSize:9}}>Date</Eyebrow><input type="date" value={d.date} onChange={e=>setD(p=>({...p,date:e.target.value}))} style={si}/></div>
        <div style={{flex:1}}><Eyebrow style={{marginBottom:5,fontSize:9}}>Category</Eyebrow><select value={d.category} onChange={e=>setD(p=>({...p,category:e.target.value}))} style={si}>{cats.map(c=><option key={c}>{c}</option>)}</select></div>
      </div>
      {d.type!=="income"&&<div><Eyebrow style={{marginBottom:5,fontSize:9}}>{d.type==="transfer"?"From":"Account"}</Eyebrow><select value={d.from||""} onChange={e=>setD(p=>({...p,from:e.target.value||null}))} style={si}><option value="">—</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
      {(d.type==="income"||d.type==="transfer")&&<div><Eyebrow style={{marginBottom:5,fontSize:9}}>To</Eyebrow><select value={d.to||""} onChange={e=>setD(p=>({...p,to:e.target.value||null}))} style={si}><option value="">—</option>{accounts.filter(a=>d.type!=="transfer"||a.id!==d.from).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}
      {err&&<div style={{color:C.oxblood,fontSize:12,background:C.oxSoft,padding:"8px 11px",borderRadius:5}}>{err}</div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={save} style={{flex:1,background:C.emerald,color:"#fff",border:"none",borderRadius:6,padding:11,fontWeight:600,fontSize:13,cursor:"pointer",letterSpacing:"0.02em"}}>Save changes</button>
        <button onClick={onCancel} style={{flex:1,background:C.panel,color:C.ink2,border:`1px solid ${C.rule2}`,borderRadius:6,padding:11,fontSize:13,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Savings return ── */
function SavingsWidget({accounts}){
  useThemeSync();
  const [rates,setRates]=useState({mahaana:10.36,mashreq:10});
  const [rm,setRm]=useState({mahaana:"July 2026"});
  const [status,setStatus]=useState("idle");
  const [note,setNote]=useState("");
  const [at,setAt]=useState(null);
  const [manual,setManual]=useState(false);
  const [draft,setDraft]=useState({mahaana:"",mashreq:""});
  const accs=accounts.filter(a=>a.tag==="savings"&&a.balance>0).map(a=>({...a,rate:a.id==="mahaana"?rates.mahaana:a.id==="mashreq"?rates.mashreq:a.rate}));
  if(!accs.length)return null;
  const tot=accs.reduce((s,a)=>s+a.balance,0);
  const blended=accs.reduce((s,a)=>s+(a.balance/tot)*a.rate,0);
  const annual=accs.reduce((s,a)=>s+a.balance*(a.rate/100),0);

  async function fetchLive(){
    setStatus("loading"); setNote("");

    const PROMPT =
`Find two current savings rates for Pakistan. Use web search. Today is ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}.

TASK 1 — Mahaana Islamic Cash Fund (MICF)
Search the web for the most recent Mahaana MICF Fund Manager Report. Try these in order:
  a) Search: "Mahaana Islamic Cash Fund Fund Manager Report" and open the newest PDF you find.
  b) Search: "site:mahaana.com MICF fund manager report"
  c) Open https://www.mahaana.com/micf and look for a linked monthly report PDF.
  d) Search MUFAP: "MUFAP Mahaana Islamic Cash Fund annualized return"
From the report's Performance table take the MTD annualised return (a percentage, typically 9-22 for Pakistan money market funds). Record which month the report covers.

TASK 2 — Mashreq Bank Pakistan Islamic savings account
Search: "Mashreq Bank Pakistan Islamic savings account profit rate" and "mashreqbank.com pakistan savings profit rate". Find the advertised annual profit rate.

RULES
- Report only figures you actually found in a source. Do not estimate or guess.
- If you genuinely cannot find a figure, use null for that rate and say why in the note.
- Rates are annual percentages as plain numbers: 10.36 not "10.36%".

Reply with raw JSON only — no markdown, no code fences, no text before or after:
{"mahaana_rate":10.36,"mahaana_report_month":"July 2026","mahaana_source":"where you found it","mashreq_rate":10.0,"mashreq_source":"where you found it","note":"one short sentence comparing them to the SBP policy rate"}`;

    try{
      const data = await callClaude({
        model:"claude-sonnet-4-6",
        max_tokens: 1600,
        tools:[{type:"web_search_20250305", name:"web_search"}],
        messages:[{ role:"user", content: PROMPT }]
      });

      // Text may be split across several blocks around tool use — join them all
      const text = (data.content||[])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      const p = extractJSON(text);
      if(!p) throw new Error("The reply wasn't valid JSON");

      const mR = p.mahaana_rate === null || p.mahaana_rate === undefined ? null : parseFloat(p.mahaana_rate);
      const sR = p.mashreq_rate === null || p.mashreq_rate === undefined ? null : parseFloat(p.mashreq_rate);

      // Sanity-check: reject figures outside a plausible Pakistan range
      const okM = mR !== null && !isNaN(mR) && mR > 0 && mR < 40;
      const okS = sR !== null && !isNaN(sR) && sR > 0 && sR < 40;

      if(!okM && !okS){
        setStatus("error");
        setNote(p.note ? `Nothing usable found — ${p.note}` : "Neither rate could be found. Enter them manually below.");
        setManual(true);
        return;
      }

      setRates(r => ({
        mahaana: okM ? mR : r.mahaana,
        mashreq: okS ? sR : r.mashreq,
      }));
      if(okM) setRm({ mahaana: p.mahaana_report_month || null });

      const parts = [];
      if(okM) parts.push(`MICF ${mR}%${p.mahaana_report_month?" ("+p.mahaana_report_month+")":""}`);
      else    parts.push("MICF not found — kept previous");
      if(okS) parts.push(`Mashreq ${sR}%`);
      else    parts.push("Mashreq not found — kept previous");

      setNote(parts.join(" · ") + (p.note ? ` — ${p.note}` : ""));
      setAt(new Date().toLocaleDateString("en-PK",{day:"numeric",month:"short",year:"numeric"}));
      setStatus(okM && okS ? "done" : "partial");
    }catch(e){
      setStatus("error");
      setNote(`${e.message||"Request failed"}. Enter the rates manually below.`);
      setManual(true);
    }
  }

  function saveManual(){const m=parseFloat(draft.mahaana),s=parseFloat(draft.mashreq);if(!isNaN(m)&&m>0)setRates(r=>({...r,mahaana:m}));if(!isNaN(s)&&s>0)setRates(r=>({...r,mashreq:s}));setAt("Entered "+new Date().toLocaleDateString("en-PK",{day:"numeric",month:"short"}));setManual(false);setStatus("done");}

  return(
    <Panel pad={0}>
      <div style={{padding:"16px 18px 14px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <Eyebrow style={{marginBottom:9}}>Return on savings</Eyebrow>
          <div style={{display:"flex",alignItems:"baseline",gap:7}}>
            <span style={{...disp,fontSize:34,fontWeight:600,color:C.brass,letterSpacing:"-0.02em",lineHeight:1}}>{blended.toFixed(2)}</span>
            <span style={{...mono,fontSize:15,color:C.brass,fontWeight:500}}>%</span>
            <span style={{fontSize:12,color:C.ink3,marginLeft:3}}>blended p.a.</span>
          </div>
          <div style={{display:"flex",gap:14,marginTop:8}}>
            <span style={{fontSize:11,color:C.ink3}}>Monthly <span style={{...mono,color:C.emerald,fontWeight:600,fontSize:12}}>{fmt(annual/12)}</span></span>
            <span style={{fontSize:11,color:C.ink3}}>Yearly <span style={{...mono,color:C.emerald,fontWeight:600,fontSize:12}}>{fmt(annual)}</span></span>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={fetchLive} disabled={status==="loading"} style={{background:status==="loading"?C.panel2:C.emerald,border:"none",color:status==="loading"?C.ink3:"#fff",borderRadius:6,padding:"7px 12px",fontSize:11,fontWeight:600,cursor:status==="loading"?"wait":"pointer",whiteSpace:"nowrap"}}>{status==="loading"?"Checking…":"Update"}</button>
          <button onClick={()=>setManual(m=>!m)} style={{background:C.panel,border:`1px solid ${C.rule2}`,color:C.ink2,borderRadius:6,padding:"7px 11px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Enter</button>
        </div>
      </div>
      <Rule/>
      <div style={{padding:"14px 18px 6px"}}>
        {accs.map((a,i)=>{
          const mo=a.balance*(a.rate/100)/12;
          const bc=a.rate>=15?C.emerald:a.rate>=10?C.brass:C.oxblood;
          return(
            <div key={a.id} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                <span style={{fontSize:13,color:C.ink,fontWeight:500}}>
                  {a.name}
                  {a.id==="mahaana"&&rm.mahaana&&<span style={{color:C.ink4,fontSize:10,marginLeft:6}}>{rm.mahaana}</span>}
                </span>
                <span><span style={{...mono,color:bc,fontWeight:600,fontSize:13}}>{a.rate}%</span><span style={{color:C.ink4,fontSize:11,marginLeft:7}}>{fmt(mo)}/mo</span></span>
              </div>
              <div style={{background:C.panel2,borderRadius:2,height:5,border:`1px solid ${C.rule}`}}>
                <div style={{width:`${Math.min(100,a.rate/20*100)}%`,height:3,margin:1,borderRadius:1,background:bc,transition:"width .5s"}}/>
              </div>
            </div>
          );
        })}
        {at&&status!=="error"&&<div style={{color:C.ink4,fontSize:11,paddingBottom:8}}>Checked {at}</div>}
        {status==="error"&&(
          <div style={{background:C.oxSoft,borderRadius:5,padding:"10px 12px",marginBottom:10}}>
            <div style={{color:C.oxblood,fontSize:11.5,lineHeight:1.55}}>{note}</div>
          </div>
        )}
        {status==="partial"&&note&&(
          <div style={{background:C.brSoft,borderRadius:5,padding:"10px 12px",marginBottom:10}}>
            <div style={{color:C.brass,fontSize:11.5,lineHeight:1.55}}>{note}</div>
          </div>
        )}
        {status==="done"&&note&&<div style={{color:C.ink3,fontSize:11,lineHeight:1.55,paddingBottom:10}}>{note}</div>}
      </div>
      {manual&&(
        <>
          <Rule/>
          <div style={{padding:"14px 18px 16px",background:C.panel2,display:"flex",flexDirection:"column",gap:11}}>
            <Eyebrow color={C.brass}>Enter rates manually</Eyebrow>
            <div style={{display:"flex",gap:9}}>
              <div style={{flex:1}}><div style={{fontSize:11,color:C.ink3,marginBottom:5}}>Mahaana MICF</div><input type="number" step="0.01" placeholder={String(rates.mahaana)} value={draft.mahaana} onChange={e=>setDraft(d=>({...d,mahaana:e.target.value}))} style={SI({padding:"9px 11px",fontSize:13,...mono})}/></div>
              <div style={{flex:1}}><div style={{fontSize:11,color:C.ink3,marginBottom:5}}>Mashreq Islamic</div><input type="number" step="0.01" placeholder={String(rates.mashreq)} value={draft.mashreq} onChange={e=>setDraft(d=>({...d,mashreq:e.target.value}))} style={SI({padding:"9px 11px",fontSize:13,...mono})}/></div>
            </div>
            <button onClick={saveManual} style={{background:C.brass,color:"#fff",border:"none",borderRadius:6,padding:11,fontWeight:600,fontSize:13,cursor:"pointer"}}>Save rates</button>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ── Insights ── */
function Analytics({txs,accounts}){
  useThemeSync();
  const [ai,setAi]=useState(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [view,setView]=useState("month");

  const mo=new Date().toISOString().slice(0,7);
  const yr=new Date().toISOString().slice(0,4);

  const totalAssets=accounts.filter(a=>a.balance>0).reduce((s,a)=>s+a.balance,0);
  const totalLiab=Math.abs(accounts.filter(a=>a.balance<0).reduce((s,a)=>s+a.balance,0));
  const netWorth=totalAssets-totalLiab;

  const monthInc=useMemo(()=>txs.filter(t=>t.type==="income"&&!t.isAdj&&t.date.startsWith(mo)).reduce((s,t)=>s+t.amount,0),[txs]);
  const monthExp=useMemo(()=>txs.filter(t=>t.type==="expense"&&!t.isAdj&&t.date.startsWith(mo)).reduce((s,t)=>s+t.amount,0),[txs]);
  const savings=monthInc-monthExp;
  const savRate=monthInc>0?((savings/monthInc)*100):0;

  const trend=useMemo(()=>{
    const ms={};
    for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const k=d.toISOString().slice(0,7);ms[k]={month:d.toLocaleString("default",{month:"short"}),income:0,expense:0};}
    txs.filter(t=>!t.isAdj).forEach(t=>{if(ms[t.date.slice(0,7)]){if(t.type==="income")ms[t.date.slice(0,7)].income+=t.amount;if(t.type==="expense")ms[t.date.slice(0,7)].expense+=t.amount;}});
    return Object.values(ms).map(m=>({...m,savings:m.income-m.expense}));
  },[txs]);

  const catData=useMemo(()=>{
    const m={};
    const f=view==="month"?t=>t.date.startsWith(mo):view==="year"?t=>t.date.startsWith(yr):()=>true;
    txs.filter(t=>t.type==="expense"&&!t.isAdj&&f(t)).forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>({name,value,icon:CAT_ICONS[name]||"📌"}));
  },[txs,view]);
  const catTotal=catData.reduce((s,c)=>s+c.value,0);

  const assetDist=accounts.filter(a=>a.balance>0).map(a=>({name:a.name.replace(" Bank","").replace(" MICF",""),value:Math.round(a.balance),color:a.color}));

  const ttStyle={contentStyle:{background:C.panel,border:`1px solid ${C.rule2}`,borderRadius:6,fontSize:12,color:C.ink,fontFamily:"'IBM Plex Mono',monospace",boxShadow:"0 4px 16px rgba(22,33,29,0.10)"},cursor:{fill:C.emerald+"0d"}};

  // ── Normalise AI response so UI never breaks on missing fields ──
  function normalise(raw){
    const arr = Array.isArray(raw.suggestions) ? raw.suggestions : [];
    return {
      verdict:       raw.verdict       || "Not enough data to assess your savings rate yet.",
      patterns:      raw.patterns      || "",
      buffer_months: raw.buffer_months || "",
      quick_win:     raw.quick_win     || "",
      debt:          raw.debt          || "",
      emergency:     raw.emergency     || "",
      suggestions:   arr.filter(s => s && s.title).map(s => ({
        title:  s.title  || "Suggestion",
        detail: s.detail || "",
        saving: s.saving || "—",
      })),
    };
  }

  async function analyse(){
    setLoading(true); setErr(""); setAi(null);

    // ── Build dataset ──
    const expSum = catData.map(c=>`${c.name}: Rs ${Math.round(c.value).toLocaleString()}`).join("; ");
    const accSum = accounts.map(a=>`${a.name} (${a.type}): Rs ${Math.round(a.balance).toLocaleString()}`).join("; ");

    const dailyMap={};
    txs.filter(t=>!t.isAdj).forEach(t=>{
      if(!dailyMap[t.date]) dailyMap[t.date]={income:0,expense:0,cats:{}};
      if(t.type==="income")  dailyMap[t.date].income+=t.amount;
      if(t.type==="expense"){dailyMap[t.date].expense+=t.amount; dailyMap[t.date].cats[t.category]=(dailyMap[t.date].cats[t.category]||0)+t.amount;}
    });
    const dailySum=Object.entries(dailyMap).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,21)
      .map(([d,v])=>{
        const top=Object.entries(v.cats).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([c,n])=>`${c} Rs${Math.round(n).toLocaleString()}`).join(", ");
        return `${d} — spent Rs ${Math.round(v.expense).toLocaleString()}, earned Rs ${Math.round(v.income).toLocaleString()}${top?" ("+top+")":""}`;
      }).join("\n");

    const moMap={};
    txs.filter(t=>!t.isAdj).forEach(t=>{
      const m=t.date.slice(0,7);
      if(!moMap[m]) moMap[m]={income:0,expense:0,cats:{}};
      if(t.type==="income")  moMap[m].income+=t.amount;
      if(t.type==="expense"){moMap[m].expense+=t.amount; moMap[m].cats[t.category]=(moMap[m].cats[t.category]||0)+t.amount;}
    });
    const moSum=Object.entries(moMap).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,18)
      .map(([m,v])=>{
        const top=Object.entries(v.cats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,n])=>`${c} Rs${Math.round(n).toLocaleString()}`).join(", ");
        const rate=v.income>0?(((v.income-v.expense)/v.income)*100).toFixed(0)+"%":"n/a";
        return `${m} — income Rs ${Math.round(v.income).toLocaleString()}, expense Rs ${Math.round(v.expense).toLocaleString()}, saved Rs ${Math.round(v.income-v.expense).toLocaleString()} (${rate})${top?" | top: "+top:""}`;
      }).join("\n");

    const yrMap={};
    txs.filter(t=>!t.isAdj).forEach(t=>{
      const y=t.date.slice(0,4);
      if(!yrMap[y]) yrMap[y]={income:0,expense:0};
      if(t.type==="income")  yrMap[y].income+=t.amount;
      if(t.type==="expense") yrMap[y].expense+=t.amount;
    });
    const yrSum=Object.entries(yrMap).sort()
      .map(([y,v])=>`${y} — income Rs ${Math.round(v.income).toLocaleString()}, expense Rs ${Math.round(v.expense).toLocaleString()}, saved Rs ${Math.round(v.income-v.expense).toLocaleString()}`).join("\n");

    const allCats={};
    txs.filter(t=>t.type==="expense"&&!t.isAdj).forEach(t=>{allCats[t.category]=(allCats[t.category]||0)+t.amount;});
    const catTrend=Object.entries(allCats).sort((a,b)=>b[1]-a[1]).slice(0,10)
      .map(([c,a])=>`${c}: Rs ${Math.round(a).toLocaleString()}`).join("; ");

    const txCount = txs.filter(t=>!t.isAdj).length;
    const bufferAccounts = accounts.filter(a=>a.tag==="savings"||a.type==="investment");
    const bufferBal = bufferAccounts.reduce((s,a)=>s+a.balance,0);
    const monthsOfData = Object.keys(moMap).length || 1;
    const avgMonthlyExp = (Object.values(moMap).reduce((s,v)=>s+v.expense,0))/monthsOfData;
    const sixMonthTarget = Math.round(avgMonthlyExp*6);
    const threeMonthTarget = Math.round(avgMonthlyExp*3);
    const bufferPct = sixMonthTarget>0 ? ((bufferBal/sixMonthTarget)*100).toFixed(1) : "n/a";
    const loanAccounts = accounts.filter(a=>a.type==="loan"&&a.balance<0);
    const loanSum = loanAccounts.map(a=>`${a.name}: Rs ${Math.round(Math.abs(a.balance)).toLocaleString()}`).join("; ") || "none";

    const PROMPT =
`You are a rigorous personal finance advisor specialising in Pakistan. You give specific, numbers-driven advice grounded strictly in the actual transaction data provided below — never invent a persona, a goal, or a figure that isn't derivable from it. Reply with raw JSON only — no markdown, no code fences, no preamble, no text outside the JSON object.

Analyse the complete financial history below and produce actionable savings advice for this user.

## CURRENT POSITION
Accounts: ${accSum || "(none yet)"}
Total assets: Rs ${Math.round(totalAssets).toLocaleString()}
Total liabilities: Rs ${Math.round(totalLiab).toLocaleString()}
Net worth: Rs ${Math.round(totalAssets-totalLiab).toLocaleString()}

## THIS MONTH
Income Rs ${Math.round(monthInc).toLocaleString()} | Expenses Rs ${Math.round(monthExp).toLocaleString()} | Saved Rs ${Math.round(savings).toLocaleString()} | Savings rate ${savRate.toFixed(1)}%

## YEARLY TOTALS
${yrSum || "(no data)"}

## MONTH-BY-MONTH
${moSum || "(no data)"}

## DAILY LOG — last 30 entries
${dailySum || "(no data)"}

## ALL-TIME CATEGORY SPEND
${catTrend || "(no data)"}

## CURRENT PERIOD BREAKDOWN
${expSum || "(no expenses logged this period)"}

## MARKET CONTEXT (Pakistan)
SBP policy rate and CPI inflation move over time — use your general knowledge of current Pakistani rates rather than a fixed figure, and say so if you're estimating.

## EMERGENCY BUFFER (derived from this user's own data, not a fixed target)
- Savings/investment-tagged accounts: Rs ${Math.round(bufferBal).toLocaleString()} (${bufferAccounts.map(a=>a.name).join(", ") || "none yet"}).
- Six-month target (6× average monthly expense of Rs ${Math.round(avgMonthlyExp).toLocaleString()}): Rs ${sixMonthTarget.toLocaleString()} — currently ${bufferPct}% funded.
- Three-month milestone: Rs ${threeMonthTarget.toLocaleString()}.
- Outstanding loans: ${loanSum}.
- Total transactions logged so far: ${txCount}.

## INSTRUCTIONS
1. If transaction data is sparse (fewer than 10 entries), say so plainly in the verdict and give advice based on the balance sheet alone rather than inventing spending patterns.
2. Quote real Rs figures from the data above. Never fabricate a number that is not derivable from it. If a figure isn't available (e.g. no loans, no savings accounts), say so instead of guessing.
3. Be specific to Pakistan: mention actual providers, tax rules, or local alternatives where relevant.
4. Challenge the user where the data warrants it — do not just validate.
5. Calculate the buffer timeline honestly from the actual monthly savings figure and the six-month target above.

## OUTPUT
Reply with this exact JSON shape and nothing else:
{"verdict":"2 sentences assessing savings rate, citing real numbers","patterns":"2 sentences on trends or anomalies found in the daily/monthly data","suggestions":[{"title":"short specific title","detail":"2-3 sentences, Pakistan-specific, cites real Rs amounts","saving":"Rs X/mo"},{"title":"...","detail":"...","saving":"Rs X/mo"},{"title":"...","detail":"...","saving":"Rs X/mo"}],"buffer_months":"honest estimate of months to reach the six-month target above at the current savings pace, or note if there isn't enough data","quick_win":"one concrete action for this week with a Rs figure","debt":"strategy for any outstanding loans listed above, or note there are none","emergency":"advice on emergency fund pace given the buffer figures above"}`;

    // ── Guard: keep the prompt within a safe size ──
    const SAFE_LIMIT = 24000;
    const promptToSend = PROMPT.length > SAFE_LIMIT
      ? PROMPT.slice(0, SAFE_LIMIT) + "\n\n[Data truncated for length. Base your analysis on what is shown above.]"
      : PROMPT;

    // ── Call with retries ──
    const MAX_ATTEMPTS = 3;
    let lastErr = "";
    for(let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++){
      try{
        const res = await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            model:"claude-sonnet-4-6",
            max_tokens: 2000,
            messages:[{ role:"user", content: promptToSend }]
          })
        });

        if(!res.ok){
          let detail = "";
          try { const eb = await res.json(); detail = eb?.error?.message || JSON.stringify(eb).slice(0,200); }
          catch(_){ try { detail = (await res.text()).slice(0,200); } catch(__){} }
          lastErr = `HTTP ${res.status}${detail?": "+detail:""}`;
          if(attempt < MAX_ATTEMPTS){ await new Promise(r=>setTimeout(r, attempt*900)); continue; }
          throw new Error(lastErr);
        }

        const data = await res.json();
        if(data.error){
          lastErr = data.error.message || "API error";
          if(attempt < MAX_ATTEMPTS){ await new Promise(r=>setTimeout(r, attempt*900)); continue; }
          throw new Error(lastErr);
        }

        const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");

        const parsed = extractJSON(text);
        if(!parsed){
          lastErr = "Could not parse the response";
          if(attempt < MAX_ATTEMPTS){ await new Promise(r=>setTimeout(r, attempt*900)); continue; }
          throw new Error(lastErr);
        }

        setAi(normalise(parsed));
        setLoading(false);
        return;
      }catch(e){
        lastErr = e.message || "Request failed";
        if(attempt === MAX_ATTEMPTS){
          setErr(`Analysis failed after ${MAX_ATTEMPTS} attempts — ${lastErr}. Tap Analyse to retry.`);
          setLoading(false);
          return;
        }
        await new Promise(r=>setTimeout(r, attempt*900));
      }
    }
  }

  const srColor=savRate>=30?C.emerald:savRate>=15?C.brass:C.oxblood;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Summary row — ledger style */}
      <Panel pad={0}>
        {[
          ["Net worth",netWorth,C.ink],
          ["Saved this month",savings,savings>=0?C.emerald:C.oxblood],
        ].map(([l,v,c],i)=>(
          <div key={l}>
            {i>0&&<Rule/>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px"}}>
              <Eyebrow>{l}</Eyebrow>
              <span style={{...disp,fontSize:22,fontWeight:600,color:c,letterSpacing:"-0.02em"}}>{fmt(v)}</span>
            </div>
          </div>
        ))}
        <Rule/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px"}}>
          <Eyebrow>Savings rate</Eyebrow>
          <span style={{...disp,fontSize:22,fontWeight:600,color:srColor,letterSpacing:"-0.02em"}}>{savRate.toFixed(1)}<span style={{...mono,fontSize:14}}>%</span></span>
        </div>
      </Panel>

      {/* Six month trend */}
      <Panel pad={0}>
        <div style={{padding:"16px 18px 12px"}}><Eyebrow>Six months — in and out</Eyebrow></div>
        <Rule/>
        <div style={{padding:"16px 8px 8px"}}>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={trend} margin={{top:4,right:10,bottom:0,left:-14}}>
              <defs>
                <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.emerald} stopOpacity={0.16}/><stop offset="100%" stopColor={C.emerald} stopOpacity={0}/></linearGradient>
                <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.oxblood} stopOpacity={0.14}/><stop offset="100%" stopColor={C.oxblood} stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid stroke={C.rule} vertical={false}/>
              <XAxis dataKey="month" tick={{fill:C.ink3,fontSize:11,fontFamily:"'IBM Plex Sans'"}} axisLine={{stroke:C.rule2}} tickLine={false}/>
              <YAxis tick={{fill:C.ink4,fontSize:10,fontFamily:"'IBM Plex Mono'"}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+"k":v}/>
              <Tooltip {...ttStyle} formatter={(v,n)=>[fmt(v),n]}/>
              <Area type="monotone" dataKey="income"  name="In"  stroke={C.emerald} strokeWidth={1.75} fill="url(#gI)"/>
              <Area type="monotone" dataKey="expense" name="Out" stroke={C.oxblood} strokeWidth={1.75} fill="url(#gE)"/>
            </AreaChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:18,justifyContent:"center",paddingTop:6}}>
            {[["In",C.emerald],["Out",C.oxblood]].map(([l,c])=>(
              <span key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.ink3}}>
                <span style={{width:14,height:2,background:c,display:"inline-block"}}/>{l}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      {/* Where it went */}
      <Panel pad={0}>
        <div style={{padding:"16px 18px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Eyebrow>Where it went</Eyebrow>
          <div style={{display:"flex",border:`1px solid ${C.rule2}`,borderRadius:5,overflow:"hidden"}}>
            {[["month","Month"],["year","Year"],["all","All"]].map(([v,l],i)=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"4px 11px",border:"none",borderLeft:i?`1px solid ${C.rule2}`:"none",background:view===v?C.ink:C.panel,color:view===v?C.paper:C.ink3,fontSize:10,fontWeight:600,cursor:"pointer",letterSpacing:"0.04em"}}>{l}</button>
            ))}
          </div>
        </div>
        <Rule/>
        {catData.length>0?(
          <div style={{padding:"16px 18px"}}>
            <div style={{display:"flex",gap:18,alignItems:"center"}}>
              <ResponsiveContainer width={116} height={116}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={34} outerRadius={56} dataKey="value" paddingAngle={1} stroke={C.panel} strokeWidth={2}>
                    {catData.map((_,i)=><Cell key={i} fill={PIE[i%PIE.length]}/>)}
                  </Pie>
                  <Tooltip {...ttStyle} formatter={v=>[fmt(v)]}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{flex:1,minWidth:0}}>
                {catData.slice(0,5).map((c,i)=>{
                  const pct=catTotal>0?((c.value/catTotal)*100).toFixed(0):0;
                  return(
                    <div key={c.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                      <span style={{width:7,height:7,background:PIE[i%PIE.length],flexShrink:0,borderRadius:1}}/>
                      <span style={{fontSize:12,color:C.ink2,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                      <span style={{...mono,fontSize:11,color:C.ink3,fontWeight:500}}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ):(
          <div style={{padding:"28px 18px",textAlign:"center",color:C.ink3,fontSize:13}}>Nothing logged for this period yet.</div>
        )}
      </Panel>

      {/* Where it sits */}
      <Panel pad={0}>
        <div style={{padding:"16px 18px 12px"}}><Eyebrow>Where it sits</Eyebrow></div>
        <Rule/>
        <div style={{padding:"14px 18px 12px"}}>
          {assetDist.map((a,i)=>{
            const max=Math.max(...assetDist.map(x=>x.value));
            return(
              <div key={a.name} style={{marginBottom:11}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                  <span style={{fontSize:12,color:C.ink2}}>{a.name}</span>
                  <span style={{...mono,fontSize:12,color:C.ink,fontWeight:500}}>{fmt(a.value)}</span>
                </div>
                <div style={{height:4,background:C.panel2,border:`1px solid ${C.rule}`,borderRadius:1}}>
                  <div style={{width:`${(a.value/max)*100}%`,height:2,margin:1,background:a.color,borderRadius:1}}/>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Advisor */}
      <Panel pad={0} style={{borderColor:C.rule2}}>
        <div style={{padding:"18px 18px 15px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
          <div>
            <div style={{...disp,fontSize:19,fontWeight:600,color:C.ink,letterSpacing:"-0.01em",marginBottom:3}}>Read the ledger</div>
            <div style={{fontSize:12,color:C.ink3,lineHeight:1.5}}>An analysis of every entry — daily, monthly, yearly.</div>
          </div>
          <button onClick={analyse} disabled={loading} style={{background:loading?C.panel2:C.ink,color:loading?C.ink3:C.paper,border:"none",borderRadius:6,padding:"10px 16px",fontWeight:600,fontSize:12,cursor:loading?"wait":"pointer",whiteSpace:"nowrap",letterSpacing:"0.02em"}}>
            {loading?"Reading…":ai?"Read again":"Analyse"}
          </button>
        </div>

        {!ai&&!loading&&!err&&(
          <>
            <Rule/>
            <div style={{padding:"26px 18px",textAlign:"center",color:C.ink3,fontSize:13,lineHeight:1.65}}>
              Every entry you log sharpens the reading.<br/>Tap <span style={{color:C.ink,fontWeight:600}}>Analyse</span> to begin.
            </div>
          </>
        )}
        {loading&&(
          <>
            <Rule/>
            <div style={{padding:"26px 18px",textAlign:"center"}}>
              <div style={{fontSize:13,color:C.ink2,marginBottom:4}}>Working through the entries…</div>
              <div style={{fontSize:12,color:C.ink4}}>Daily, monthly and yearly patterns</div>
            </div>
          </>
        )}
        {err&&(
          <>
            <Rule/>
            <div style={{padding:"16px 18px",color:C.oxblood,fontSize:12,background:C.oxSoft,lineHeight:1.55}}>{err}</div>
          </>
        )}

        {ai&&(
          <div>
            <Rule/>
            {/* Verdict */}
            <div style={{padding:"16px 18px",borderLeft:`3px solid ${C.brass}`}}>
              <Eyebrow color={C.brass} style={{marginBottom:7}}>The verdict</Eyebrow>
              <div style={{fontSize:13,color:C.ink,lineHeight:1.7}}>{ai.verdict}</div>
            </div>
            {ai.patterns&&<><Rule/>
              <div style={{padding:"16px 18px",borderLeft:`3px solid ${C.slate}`}}>
                <Eyebrow color={C.slate} style={{marginBottom:7}}>Patterns in the entries</Eyebrow>
                <div style={{fontSize:13,color:C.ink,lineHeight:1.7}}>{ai.patterns}</div>
              </div></>}
            {ai.buffer_months&&<><Rule/>
              <div style={{padding:"16px 18px",background:C.brSoft}}>
                <Eyebrow color={C.brass} style={{marginBottom:7}}>Buffer timeline</Eyebrow>
                <div style={{fontSize:13,color:C.ink,lineHeight:1.7}}>{ai.buffer_months}</div>
              </div></>}
            {ai.quick_win&&<><Rule/>
              <div style={{padding:"16px 18px",background:C.emSoft}}>
                <Eyebrow color={C.emerald} style={{marginBottom:7}}>Do this week</Eyebrow>
                <div style={{fontSize:13,color:C.ink,lineHeight:1.7}}>{ai.quick_win}</div>
              </div></>}

            {ai.suggestions?.length>0&&(
              <>
                <Rule/>
                <div style={{padding:"16px 18px 8px"}}><Eyebrow>What to change</Eyebrow></div>
                {ai.suggestions.map((s,i)=>(
                  <div key={i} style={{padding:"12px 18px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"baseline",gap:9}}>
                        <span style={{...mono,fontSize:11,color:C.ink4,fontWeight:600}}>{String(i+1).padStart(2,"0")}</span>
                        <span style={{fontSize:14,fontWeight:600,color:C.ink,letterSpacing:"-0.01em"}}>{s.title}</span>
                      </div>
                      <span style={{...mono,fontSize:11,color:C.emerald,fontWeight:600,whiteSpace:"nowrap"}}>{s.saving}</span>
                    </div>
                    <div style={{fontSize:12.5,color:C.ink2,lineHeight:1.7,paddingLeft:28}}>{s.detail}</div>
                  </div>
                ))}
              </>
            )}

            {(ai.debt||ai.emergency)&&<Rule/>}
            {ai.debt&&<div style={{padding:"14px 18px"}}>
              <Eyebrow color={C.oxblood} style={{marginBottom:6}}>On the loan</Eyebrow>
              <div style={{fontSize:12.5,color:C.ink2,lineHeight:1.65}}>{ai.debt}</div>
            </div>}
            {ai.debt&&ai.emergency&&<Rule/>}
            {ai.emergency&&<div style={{padding:"14px 18px 18px"}}>
              <Eyebrow color={C.brass} style={{marginBottom:6}}>On the buffer</Eyebrow>
              <div style={{fontSize:12.5,color:C.ink2,lineHeight:1.65}}>{ai.emergency}</div>
            </div>}
          </div>
        )}
      </Panel>
    </div>
  );
}


/* ── Your Advisor: a persistent, steerable chat over your own ledger data ── */
const DEFAULT_PERSONA =
`You are the user's personal finance advisor, built on top of their own transaction ledger. You are direct, numbers-first, and never flatter them. You challenge weak reasoning. You cite real Rs figures from the data provided in the ledger context below — never invented ones. Base everything you know about the user's goals, accounts, and debts strictly on that data; don't assume a profession, a specific fund, or a fixed target that isn't shown there. Keep answers focused and concrete — prefer a short, sharp answer with real numbers over a long generic one.`;

function buildLedgerContext(txs, accounts){
  const totalAssets = accounts.filter(a=>a.balance>0).reduce((s,a)=>s+a.balance,0);
  const totalLiab   = Math.abs(accounts.filter(a=>a.balance<0).reduce((s,a)=>s+a.balance,0));
  const accSum = accounts.map(a=>`${a.name} (${a.type}${a.tag?", "+a.tag:""}): Rs ${Math.round(a.balance).toLocaleString()}`).join("; ");

  const mo = new Date().toISOString().slice(0,7);
  const monthTxs = txs.filter(t=>!t.isAdj && t.date.startsWith(mo));
  const mInc = monthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const mExp = monthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);

  const moMap={};
  txs.filter(t=>!t.isAdj).forEach(t=>{
    const m=t.date.slice(0,7);
    if(!moMap[m]) moMap[m]={income:0,expense:0,cats:{}};
    if(t.type==="income") moMap[m].income+=t.amount;
    if(t.type==="expense"){ moMap[m].expense+=t.amount; moMap[m].cats[t.category]=(moMap[m].cats[t.category]||0)+t.amount; }
  });
  const moSum = Object.entries(moMap).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12).map(([m,v])=>{
    const top = Object.entries(v.cats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,n])=>`${c} Rs${Math.round(n).toLocaleString()}`).join(", ");
    return `${m}: income Rs${Math.round(v.income).toLocaleString()}, expense Rs${Math.round(v.expense).toLocaleString()}, saved Rs${Math.round(v.income-v.expense).toLocaleString()}${top?" | top: "+top:""}`;
  }).join("\n");

  const recent = txs.filter(t=>!t.isAdj).slice(0,40).map(t=>
    `${t.date} ${t.type} Rs${Math.round(t.amount).toLocaleString()} [${t.category}] "${t.desc}"`
  ).join("\n");

  const allCats={};
  txs.filter(t=>t.type==="expense"&&!t.isAdj).forEach(t=>{ allCats[t.category]=(allCats[t.category]||0)+t.amount; });
  const catTotals = Object.entries(allCats).sort((a,b)=>b[1]-a[1]).map(([c,a])=>`${c}: Rs${Math.round(a).toLocaleString()}`).join("; ");

  const bufferAccounts = accounts.filter(a=>a.tag==="savings"||a.type==="investment");
  const bufferBal = bufferAccounts.reduce((s,a)=>s+a.balance,0);
  const monthsOfData = Object.keys(moMap).length || 1;
  const avgMonthlyExp = (Object.values(moMap).reduce((s,v)=>s+v.expense,0))/monthsOfData;
  const sixMonthTarget = Math.round(avgMonthlyExp*6);
  const bufferPct = sixMonthTarget>0 ? ((bufferBal/sixMonthTarget)*100).toFixed(1) : "n/a";

  return `## ACCOUNTS
${accSum}
Total assets: Rs ${Math.round(totalAssets).toLocaleString()} | Total liabilities: Rs ${Math.round(totalLiab).toLocaleString()} | Net worth: Rs ${Math.round(totalAssets-totalLiab).toLocaleString()}

## THIS MONTH
Income Rs ${Math.round(mInc).toLocaleString()} | Expenses Rs ${Math.round(mExp).toLocaleString()} | Saved Rs ${Math.round(mInc-mExp).toLocaleString()}

## EMERGENCY BUFFER
Savings/investment accounts: Rs ${Math.round(bufferBal).toLocaleString()} (${bufferAccounts.map(a=>a.name).join(", ") || "none yet"}) — ${bufferPct}% of the Rs ${sixMonthTarget.toLocaleString()} six-month target (6× average monthly expense)

## MONTH-BY-MONTH (most recent first)
${moSum || "(no monthly data yet)"}

## ALL-TIME SPEND BY CATEGORY
${catTotals || "(none yet)"}

## MOST RECENT 40 ENTRIES
${recent || "(none yet)"}

Total entries logged: ${txs.filter(t=>!t.isAdj).length}`;
}

function Advisor({txs, accounts, userId}){
  useThemeSync();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [showPersona, setShowPersona] = useState(false);
  const [personaDraft, setPersonaDraft] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(()=>{ (async()=>{
    const m = await sl(skFor(userId, "advisor_msgs"));
    const p = await sl(skFor(userId, "advisor_persona"));
    if(m?.length) setMsgs(m);
    if(p) setPersona(p);
    setReady(true);
  })(); },[userId]);
  useEffect(()=>{ if(ready) ss(skFor(userId, "advisor_msgs"), msgs); },[msgs, ready, userId]);
  useEffect(()=>{ if(ready) ss(skFor(userId, "advisor_persona"), persona); },[persona, ready, userId]);

  const suggestions = [
    "Where is my money actually going this month?",
    "Am I on track for the 6-month buffer?",
    "What's one thing I should cut?",
    "Compare this month to last month",
  ];

  async function send(text){
    const q = (text ?? input).trim();
    if(!q || sending) return;
    setErr("");
    const userMsg = { role:"user", content:q, id:Date.now() };
    const nextMsgs = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setInput("");
    setSending(true);

    try{
      const context = buildLedgerContext(txs, accounts);
      const systemPreamble =
`${persona}

You have the user's real ledger data below. Always reason from these actual figures — never invent numbers. If the data doesn't cover what's asked, say so plainly rather than guessing. Keep replies conversational — short paragraphs, no headers, no markdown tables unless a table genuinely helps. This is a chat, not a report.

${context}`;

      // Fold system + running conversation into the messages array
      // (first user turn carries the ledger context so it's always current)
      const history = nextMsgs.slice(-16).map((m,i,arr) => {
        if(i === 0) return { role:"user", content: systemPreamble + "\n\n---\n\nUser's question: " + m.content };
        return { role: m.role, content: m.content };
      });

      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: history,
      });

      const text2 = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
      if(!text2) throw new Error("Empty response");

      setMsgs(prev => [...prev, { role:"assistant", content:text2, id:Date.now()+1 }]);
    }catch(e){
      setErr(e.message || "Something went wrong. Try again.");
    }finally{
      setSending(false);
    }
  }

  function savePersona(){
    setPersona(personaDraft.trim() || DEFAULT_PERSONA);
    setShowPersona(false);
  }

  function resetPersona(){
    setPersona(DEFAULT_PERSONA);
    setPersonaDraft(DEFAULT_PERSONA);
  }

  function clearChat(){
    setMsgs([]);
    setErr("");
  }

  return (
    <div style={{display:"flex", flexDirection:"column", gap:14}}>

      {/* Header row: persona control */}
      <Panel pad={0}>
        <div style={{padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10}}>
          <div style={{minWidth:0}}>
            <div style={{...disp, fontSize:16, fontWeight:600, color:C.ink}}>Your Advisor</div>
            <div style={{fontSize:11, color:C.ink3, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
              Reads every entry you've logged · knows nothing outside it
            </div>
          </div>
          <div style={{display:"flex", gap:6, flexShrink:0}}>
            <button onClick={()=>{setPersonaDraft(persona); setShowPersona(s=>!s);}} style={{background:showPersona?C.emerald:C.panel, color:showPersona?"#fff":C.ink2, border:`1px solid ${showPersona?C.emerald:C.rule2}`, borderRadius:6, padding:"6px 11px", fontSize:11, fontWeight:600, cursor:"pointer"}}>Behaviour</button>
            {msgs.length>0 && <button onClick={clearChat} style={{background:C.panel, color:C.ink3, border:`1px solid ${C.rule2}`, borderRadius:6, padding:"6px 11px", fontSize:11, fontWeight:600, cursor:"pointer"}}>Clear</button>}
          </div>
        </div>

        {showPersona && (
          <>
            <Rule/>
            <div style={{padding:"14px 16px", background:C.panel2, display:"flex", flexDirection:"column", gap:10}}>
              <Eyebrow>How your advisor should behave</Eyebrow>
              <textarea
                value={personaDraft}
                onChange={e=>setPersonaDraft(e.target.value)}
                rows={6}
                style={{...SI({fontSize:12.5, lineHeight:1.6, resize:"vertical", fontFamily:"'IBM Plex Sans',sans-serif"})}}
              />
              <div style={{display:"flex", gap:8}}>
                <button onClick={savePersona} style={{flex:1, background:C.emerald, color:"#fff", border:"none", borderRadius:6, padding:10, fontWeight:600, fontSize:12.5, cursor:"pointer"}}>Save</button>
                <button onClick={resetPersona} style={{background:C.panel, color:C.ink3, border:`1px solid ${C.rule2}`, borderRadius:6, padding:"10px 14px", fontSize:12.5, cursor:"pointer"}}>Reset to default</button>
              </div>
            </div>
          </>
        )}
      </Panel>

      {/* Conversation */}
      <Panel pad={0} style={{minHeight:280}}>
        {msgs.length===0 ? (
          <div style={{padding:"32px 20px"}}>
            <div style={{textAlign:"center", color:C.ink3, fontSize:13, lineHeight:1.65, marginBottom:20}}>
              Ask anything about your money.<br/>It reads your actual ledger — every account, every entry.
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              {suggestions.map(s => (
                <button key={s} onClick={()=>send(s)} style={{textAlign:"left", background:C.panel2, border:`1px solid ${C.rule}`, borderRadius:8, padding:"11px 14px", fontSize:12.5, color:C.ink2, cursor:"pointer"}}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{padding:"16px 16px 8px", display:"flex", flexDirection:"column", gap:14}}>
            {msgs.map(m => (
              <div key={m.id} style={{display:"flex", flexDirection:"column", alignItems: m.role==="user" ? "flex-end" : "flex-start"}}>
                <div style={{
                  maxWidth:"88%",
                  background: m.role==="user" ? C.ink : C.panel2,
                  color: m.role==="user" ? C.paper : C.ink,
                  border: m.role==="user" ? "none" : `1px solid ${C.rule}`,
                  borderRadius: m.role==="user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  padding:"10px 13px",
                  fontSize:13,
                  lineHeight:1.65,
                  whiteSpace:"pre-wrap",
                }}>{m.content}</div>
              </div>
            ))}
            {sending && (
              <div style={{display:"flex", justifyContent:"flex-start"}}>
                <div style={{background:C.panel2, border:`1px solid ${C.rule}`, borderRadius:"12px 12px 12px 3px", padding:"10px 13px", fontSize:12.5, color:C.ink3}}>Reading the ledger…</div>
              </div>
            )}
            {err && (
              <div style={{background:C.oxSoft, borderRadius:8, padding:"10px 13px", color:C.oxblood, fontSize:12}}>{err}</div>
            )}
          </div>
        )}
      </Panel>

      {/* Composer */}
      <div style={{display:"flex", gap:8}}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } }}
          placeholder="Ask your advisor…"
          style={SI({flex:1})}
        />
        <button onClick={()=>send()} disabled={sending || !input.trim()} style={{
          background: (sending||!input.trim()) ? C.panel2 : C.emerald,
          color: (sending||!input.trim()) ? C.ink4 : "#fff",
          border:"none", borderRadius:8, padding:"0 18px", fontWeight:600, fontSize:13,
          cursor:(sending||!input.trim())?"default":"pointer"
        }}>Send</button>
      </div>
    </div>
  );
}

/* ── Workspace: the whole app, once a user is signed in ── */
function Workspace({userId, userEmail, onLogout}){
  useThemeSync();
  const [loaded,setLoaded]=useState(false);
  const [mode,setMode]=useState("light");
  const [state,dispatch]=useReducer(reducer,{accounts:INIT_ACCS,txs:INIT_TXS});
  const [cats,setCats]=useState(DEFAULT_CATS);
  const [tab,setTab]=useState("home");
  const [filter,setFilter]=useState("all");
  const [period,setPeriod]=useState("all");
  const [editId,setEditId]=useState(null);
  const [balId,setBalId]=useState(null);
  const [balDraft,setBalDraft]=useState("");
  const [sheet,setSheet]=useState(null);
  const [form,setForm]=useState({date:today(),desc:"",amount:"",type:"expense",category:"Food & Dining",from:null,to:null});
  const [txErr,setTxErr]=useState("");
  const [accForm,setAccForm]=useState({name:"",balance:"",type:"bank",color:ACCT_COLORS[0]});
  const [accErr,setAccErr]=useState("");
  const [catInput,setCatInput]=useState("");
  const [catErr,setCatErr]=useState("");

  useEffect(()=>{(async()=>{
    const t=await sl(skFor(userId,"txs")),a=await sl(skFor(userId,"accs")),c=await sl(skFor(userId,"cats")),m=await sl(skFor(userId,"theme"));
    if(t?.length)dispatch({type:"LOAD_TXS",txs:t});
    if(a?.length)dispatch({type:"LOAD_ACCS",accs:a});
    if(c?.length)setCats(c);
    const initialMode = (m==="dark"||m==="light") ? m : "light"; // default is light
    setMode(initialMode);
    applyTheme(initialMode);
    setLoaded(true);
  })();},[userId]);

  function toggleTheme(){
    const next = mode==="light" ? "dark" : "light";
    setMode(next);
    applyTheme(next);
    ss(skFor(userId,"theme"), next);
  }
  useEffect(()=>{if(loaded)ss(skFor(userId,"txs"),state.txs);},[state.txs,loaded,userId]);
  useEffect(()=>{if(loaded)ss(skFor(userId,"accs"),state.accounts);},[state.accounts,loaded,userId]);
  useEffect(()=>{if(loaded)ss(skFor(userId,"cats"),cats);},[cats,loaded,userId]);

  const assets=state.accounts.filter(a=>a.balance>0).reduce((s,a)=>s+a.balance,0);
  const liabs=Math.abs(state.accounts.filter(a=>a.balance<0).reduce((s,a)=>s+a.balance,0));
  const nw=assets-liabs;
  const mo=new Date().toISOString().slice(0,7);
  const mInc=useMemo(()=>state.txs.filter(t=>t.type==="income"&&!t.isAdj&&t.date.startsWith(mo)).reduce((s,t)=>s+t.amount,0),[state.txs]);
  const mExp=useMemo(()=>state.txs.filter(t=>t.type==="expense"&&!t.isAdj&&t.date.startsWith(mo)).reduce((s,t)=>s+t.amount,0),[state.txs]);
  const mSav=mInc-mExp;
  // Emergency buffer = any account tagged "savings" or typed "investment".
  // Target is a rolling average of the user's own monthly expenses — not a
  // fixed figure — so it's meaningful for any user's actual spending.
  const bufferAccounts=state.accounts.filter(a=>a.tag==="savings"||a.type==="investment");
  const bufferBal=bufferAccounts.reduce((s,a)=>s+a.balance,0);
  const avgMonthlyExp=useMemo(()=>{
    const byMonth={};
    state.txs.filter(t=>t.type==="expense"&&!t.isAdj).forEach(t=>{const k=t.date.slice(0,7);byMonth[k]=(byMonth[k]||0)+t.amount;});
    const vals=Object.values(byMonth);
    return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
  },[state.txs]);
  const T3=Math.round(avgMonthlyExp*3),T6=Math.round(avgMonthlyExp*6);

  const catBreak=useMemo(()=>{const m={};state.txs.filter(t=>t.type==="expense"&&!t.isAdj&&t.date.startsWith(mo)).forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5);},[state.txs]);

  const filtered=useMemo(()=>{
    const now=new Date().toISOString();
    const dS=now.slice(0,10),mS=now.slice(0,7),yS=now.slice(0,4);
    return state.txs.filter(t=>{
      if(filter!=="all"&&t.type!==filter)return false;
      if(period==="day")return t.date===dS;
      if(period==="month")return t.date.startsWith(mS);
      if(period==="year")return t.date.startsWith(yS);
      return true;
    });
  },[state.txs,filter,period]);

  // Group transactions by date — ledger pages
  const grouped=useMemo(()=>{
    const g={};
    filtered.forEach(t=>{(g[t.date]=g[t.date]||[]).push(t);});
    return Object.entries(g).sort((a,b)=>b[0].localeCompare(a[0]));
  },[filtered]);

  function addTx(){setTxErr("");const a=parseFloat(form.amount);if(!form.desc.trim())return setTxErr("Add a description.");if(!a||a<=0)return setTxErr("Enter an amount above zero.");if(form.type==="transfer"&&form.from===form.to)return setTxErr("Pick two different accounts.");dispatch({type:"ADD_TX",p:{...form,amount:a}});setForm({date:today(),desc:"",amount:"",type:"expense",category:"Food & Dining",from:null,to:null});setSheet(null);}
  function addAcc(){setAccErr("");if(!accForm.name.trim())return setAccErr("Give the account a name.");const b=parseFloat(accForm.balance);if(isNaN(b))return setAccErr("Enter the current balance.");const ic={bank:"🏦",wallet:"📱",cash:"💵",investment:"📈",loan:"⚠",other:"•"};dispatch({type:"ADD_ACC",p:{id:"acc_"+Date.now(),name:accForm.name.trim(),balance:b,opening:b,color:accForm.color,icon:ic[accForm.type]||"•",type:accForm.type}});setAccForm({name:"",balance:"",type:"bank",color:ACCT_COLORS[0]});setSheet(null);}
  function addCat(){setCatErr("");const c=catInput.trim();if(!c)return setCatErr("Give the category a name.");if(cats.includes(c))return setCatErr("That one already exists.");setCats(p=>[...p,c]);setCatInput("");setSheet(null);}

  const si=SI();
  const srPct=mInc>0?(mSav/mInc)*100:0;
  const srColor=srPct>=30?C.emerald:srPct>=15?C.brass:C.oxblood;
  const dateLabel=d=>{
    const t=today();
    if(d===t)return "Today";
    const y=new Date(Date.now()-864e5).toISOString().slice(0,10);
    if(d===y)return "Yesterday";
    return new Date(d+"T00:00:00").toLocaleDateString("en-PK",{weekday:"short",day:"numeric",month:"long"});
  };

  if(!loaded)return (
    <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",background:C.paper,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{...disp,fontSize:26,color:C.ink,marginBottom:8,fontWeight:600}}>Bahi Khata</div>
        <div style={{color:C.ink3,fontSize:13}}>Opening the ledger…</div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');`}</style>
    </div>
  );

  return (
    <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",background:C.paper,minHeight:"100vh",color:C.ink,maxWidth:640,margin:"0 auto",paddingBottom:78}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}
        input[type=number]{-moz-appearance:textfield;}
        input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
        ::-webkit-scrollbar{width:0;height:0;}
        button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid ${C.emerald};outline-offset:2px;}
        input:focus,select:focus{border-color:${C.emerald}!important;}
        @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
      `}</style>

      {/* ═══ HOME ═══ */}
      {tab==="home"&&(
        <div>
          {/* Masthead */}
          <div style={{padding:"38px 18px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{...disp,fontSize:25,fontWeight:600,letterSpacing:"-0.02em",color:C.ink,lineHeight:1.1}}>Bahi Khata</div>
              <div style={{fontSize:12,color:C.ink3,marginTop:4}}>{userEmail} · {new Date().toLocaleDateString("en-PK",{month:"long",year:"numeric"})}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={toggleTheme} aria-label={mode==="light"?"Switch to dark mode":"Switch to light mode"} style={{background:C.panel,border:`1px solid ${C.rule2}`,color:C.ink2,borderRadius:6,width:37,height:37,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{mode==="light"?"☾":"☀"}</button>
              <button onClick={()=>setSheet("add-tx")} style={{background:C.ink,color:C.paper,border:"none",borderRadius:6,padding:"10px 16px",fontWeight:600,fontSize:12.5,cursor:"pointer",letterSpacing:"0.02em"}}>New entry</button>
            </div>
          </div>

          <div style={{padding:"0 18px",display:"flex",flexDirection:"column",gap:14}}>

            <AdSlot slotId="home-top" label="Advertisement"/>

            {/* The balance — signature element */}
            <div style={{background:C.panel,border:`1px solid ${C.rule2}`,borderTop:`3px solid ${C.emerald}`,borderRadius:"3px 3px 10px 10px",padding:"22px 20px 18px"}}>
              <Eyebrow style={{marginBottom:12}}>Balance carried forward</Eyebrow>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:18}}>
                <span style={{...mono,fontSize:17,color:C.ink3,fontWeight:500,alignSelf:"flex-start",paddingTop:6}}>Rs</span>
                <span style={{...disp,fontSize:44,fontWeight:600,letterSpacing:"-0.035em",color:nw<0?C.oxblood:C.ink,lineHeight:1}}>{NUM(nw)}</span>
              </div>
              <Rule style={{marginBottom:14}}/>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                {[["Assets",assets,C.emerald],["Liabilities",-liabs,C.oxblood],["Saved",mSav,srColor]].map(([l,v,c])=>(
                  <div key={l}>
                    <Eyebrow style={{fontSize:9,marginBottom:5}}>{l}</Eyebrow>
                    <span style={{...mono,fontSize:13,fontWeight:600,color:c}}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Month at a glance */}
            <Panel pad={0}>
              <div style={{display:"flex"}}>
                {[["In this month",mInc,C.emerald],["Out this month",mExp,C.oxblood]].map(([l,v,c],i)=>(
                  <div key={l} style={{flex:1,padding:"15px 16px",borderLeft:i?`1px solid ${C.rule}`:"none"}}>
                    <Eyebrow style={{fontSize:9,marginBottom:7}}>{l}</Eyebrow>
                    <span style={{...mono,fontSize:15,fontWeight:600,color:c}}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Top spending */}
            {catBreak.length>0&&(
              <Panel pad={0}>
                <div style={{padding:"15px 18px 12px"}}><Eyebrow>Largest outgoings</Eyebrow></div>
                <Rule/>
                <div style={{padding:"6px 18px 14px"}}>
                  {catBreak.map(([cat,amt],i)=>{
                    const pct=mExp>0?(amt/mExp*100):0;
                    return(
                      <div key={cat} style={{paddingTop:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                          <span style={{fontSize:13,color:C.ink2,display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:14}}>{CAT_ICONS[cat]||"📌"}</span>{cat}
                          </span>
                          <span style={{...mono,fontSize:12.5,fontWeight:600,color:C.ink}}>{fmt(amt)}</span>
                        </div>
                        <div style={{height:4,background:C.panel2,border:`1px solid ${C.rule}`,borderRadius:1}}>
                          <div style={{width:`${pct}%`,height:2,margin:1,background:PIE[i%PIE.length],borderRadius:1}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* Accounts */}
            {[
              {label:"Cash",types:["cash"]},
              {label:"Banks and wallets",types:["bank","wallet"]},
              {label:"Invested",types:["investment"]},
              {label:"Owed",types:["loan"]},
            ].map(g=>{
              const accs=state.accounts.filter(a=>g.types.includes(a.type)&&(a.tag!=="closed"||a.balance!==0));
              if(!accs.length)return null;
              return(
                <div key={g.label}>
                  <Eyebrow style={{marginBottom:9,paddingLeft:2}}>{g.label}</Eyebrow>
                  <Panel pad={0}>
                    {accs.map((a,i)=>(
                      <div key={a.id}>
                        {i>0&&<Rule/>}
                        <div style={{padding:"13px 16px"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:11,minWidth:0}}>
                              <div style={{width:3,height:30,background:a.color,borderRadius:1,flexShrink:0}}/>
                              <div style={{minWidth:0}}>
                                <div style={{fontWeight:500,fontSize:13.5,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                                <div style={{fontSize:10.5,color:a.tag==="salary+current"?C.emerald:a.tag==="savings"?C.brass:a.type==="loan"&&a.balance<0?C.oxblood:C.ink4,marginTop:2,letterSpacing:"0.03em"}}>
                                  {a.tag==="salary+current"?"Salary · current":a.tag==="current"?"Current":a.tag==="savings"&&a.rate?`Savings · ${a.rate}% p.a.`:a.tag==="closed"?"Settled":a.type==="loan"?"Outstanding":a.type}
                                </div>
                              </div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <Figure value={a.balance} size={14.5}/>
                              <div><button onClick={()=>{setBalId(balId===a.id?null:a.id);setBalDraft(String(a.balance));}} style={{background:"none",border:"none",color:C.emerald,cursor:"pointer",fontSize:10.5,fontWeight:600,padding:"3px 0 0",letterSpacing:"0.03em"}}>{balId===a.id?"close":"correct"}</button></div>
                            </div>
                          </div>
                          {balId===a.id&&(
                            <div style={{marginTop:11,display:"flex",gap:7}}>
                              <input type="number" value={balDraft} onChange={e=>setBalDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(balDraft);if(!isNaN(v))dispatch({type:"SET_BAL",id:a.id,bal:v});setBalId(null);}if(e.key==="Escape")setBalId(null);}} autoFocus style={SI({flex:1,padding:"9px 11px",fontSize:13,...mono})}/>
                              <button onClick={()=>{const v=parseFloat(balDraft);if(!isNaN(v))dispatch({type:"SET_BAL",id:a.id,bal:v});setBalId(null);}} style={{background:C.emerald,color:"#fff",border:"none",borderRadius:6,padding:"9px 15px",fontWeight:600,fontSize:12.5,cursor:"pointer"}}>Set</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </Panel>
                </div>
              );
            })}

            {/* Emergency buffer */}
            {bufferAccounts.length>0 && T6>0 && (
              <Panel pad={0}>
                <div style={{padding:"15px 18px 12px"}}><Eyebrow>Emergency buffer · {bufferAccounts.map(a=>a.name).join(", ")}</Eyebrow></div>
                <Rule/>
                <div style={{padding:"14px 18px 8px"}}>
                  {[["Three months",T3,C.brass],["Six months",T6,C.emerald]].map(([lbl,tgt,clr])=>{
                    const pct=Math.min(100,(bufferBal/tgt)*100);
                    return(
                      <div key={lbl} style={{marginBottom:15}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                          <span style={{fontSize:12.5,color:C.ink2,fontWeight:500}}>{lbl}</span>
                          <span><span style={{...mono,color:clr,fontWeight:600,fontSize:12.5}}>{pct.toFixed(1)}%</span><span style={{color:C.ink4,fontSize:11,marginLeft:7}}>of {fmt(tgt)}</span></span>
                        </div>
                        <div style={{height:6,background:C.panel2,border:`1px solid ${C.rule}`,borderRadius:1}}>
                          <div style={{width:`${pct}%`,height:4,margin:1,background:clr,borderRadius:1,transition:"width .5s"}}/>
                        </div>
                        <div style={{...mono,color:C.ink4,fontSize:10.5,marginTop:5}}>{fmt(Math.max(0,tgt-bufferBal))} still to go</div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            <SavingsWidget accounts={state.accounts}/>

            <AdSlot slotId="home-bottom" label="Advertisement"/>
          </div>
        </div>
      )}

      {/* ═══ LEDGER ═══ */}
      {tab==="history"&&(
        <div style={{padding:"38px 18px 0"}}>
          <div style={{...disp,fontSize:25,fontWeight:600,letterSpacing:"-0.02em",marginBottom:18}}>The ledger</div>

          <div style={{display:"flex",border:`1px solid ${C.rule2}`,borderRadius:6,overflow:"hidden",marginBottom:9,background:C.panel}}>
            {[["all","All"],["year","Year"],["month","Month"],["day","Today"]].map(([p,l],i)=>(
              <button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:"8px 0",border:"none",borderLeft:i?`1px solid ${C.rule2}`:"none",background:period===p?C.ink:C.panel,color:period===p?C.paper:C.ink3,fontSize:11.5,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em"}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",border:`1px solid ${C.rule2}`,borderRadius:6,overflow:"hidden",marginBottom:20,background:C.panel}}>
            {[["all","Everything"],["expense","Out"],["income","In"],["transfer","Moved"]].map(([f,l],i)=>(
              <button key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:"8px 0",border:"none",borderLeft:i?`1px solid ${C.rule2}`:"none",background:filter===f?C.emerald:C.panel,color:filter===f?"#fff":C.ink3,fontSize:11.5,fontWeight:600,cursor:"pointer",letterSpacing:"0.03em"}}>{l}</button>
            ))}
          </div>

          <AdSlot slotId="ledger-top" label="Advertisement" style={{marginBottom:20}}/>

          {grouped.length===0&&(
            <div style={{textAlign:"center",padding:"52px 20px",color:C.ink3}}>
              <div style={{fontSize:14,marginBottom:6,color:C.ink2}}>No entries for this period.</div>
              <div style={{fontSize:12.5,lineHeight:1.6}}>Tap <span style={{color:C.ink,fontWeight:600}}>+</span> to record one.</div>
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            {grouped.map(([date,items])=>{
              const dayOut=items.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
              return(
                <div key={date}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8,paddingLeft:2}}>
                    <Eyebrow color={C.ink2}>{dateLabel(date)}</Eyebrow>
                    {dayOut>0&&<span style={{...mono,fontSize:11,color:C.ink4}}>−{fmt(dayOut).replace("Rs ","Rs ")}</span>}
                  </div>
                  <Panel pad={0}>
                    {items.map((tx,i)=>(
                      <div key={String(tx.id)}>
                        {i>0&&<Rule/>}
                        {editId!==null&&String(editId)===String(tx.id)?(
                          <div style={{padding:10}}>
                            <TxEditor tx={tx} accounts={state.accounts} cats={cats} onSave={u=>{dispatch({type:"EDIT_TX",p:u});setEditId(null);}} onCancel={()=>setEditId(null)}/>
                          </div>
                        ):(
                          <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:11}}>
                            <TxMark type={tx.type}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:500,fontSize:13.5,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{tx.desc}</div>
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                <span style={{fontSize:11,color:C.ink4}}>{CAT_ICONS[tx.category]||"📌"} {tx.category}</span>
                                {tx.isAdj&&<Tag tone="br">correction</Tag>}
                              </div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <Figure value={tx.type==="expense"?-tx.amount:tx.amount} size={14} color={tx.type==="transfer"?C.slate:undefined} positive={tx.type==="income"}/>
                              <div style={{display:"flex",gap:9,justifyContent:"flex-end",marginTop:3}}>
                                <button onClick={()=>setEditId(String(tx.id))} style={{background:"none",border:"none",color:C.emerald,cursor:"pointer",fontSize:10.5,fontWeight:600,padding:0}}>edit</button>
                                <button onClick={()=>dispatch({type:"DEL_TX",id:tx.id})} style={{background:"none",border:"none",color:C.ink4,cursor:"pointer",fontSize:10.5,padding:0}}>remove</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </Panel>
                </div>
              );
            })}
          </div>

          <AdSlot slotId="ledger-bottom" label="Advertisement"/>
        </div>
      )}
      {tab==="analytics"&&(
        <div style={{padding:"38px 18px 0"}}>
          <div style={{...disp,fontSize:25,fontWeight:600,letterSpacing:"-0.02em",marginBottom:18}}>Reading</div>
          <AdSlot slotId="reading-top" label="Advertisement" style={{marginBottom:14}}/>
          <Analytics txs={state.txs} accounts={state.accounts}/>
          <AdSlot slotId="reading-bottom" label="Advertisement" style={{marginTop:14}}/>
        </div>
      )}

      {/* ═══ ADVISOR ═══ */}
      {tab==="advisor"&&(
        <div style={{padding:"38px 18px 0"}}>
          <div style={{...disp,fontSize:25,fontWeight:600,letterSpacing:"-0.02em",marginBottom:18}}>Advisor</div>
          <Advisor txs={state.txs} accounts={state.accounts} userId={userId}/>
        </div>
      )}

      {tab==="settings"&&(
        <div style={{padding:"38px 18px 0",display:"flex",flexDirection:"column",gap:14}}>
          <div style={{...disp,fontSize:25,fontWeight:600,letterSpacing:"-0.02em",marginBottom:4}}>Setup</div>

          <div>
            <Eyebrow style={{marginBottom:9,paddingLeft:2}}>Signed in as</Eyebrow>
            <Panel pad={0}>
              <div style={{padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                <div style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13,color:C.ink}}>{userEmail}</div>
                <button onClick={onLogout} style={{background:C.panel,border:`1px solid ${C.rule2}`,color:C.oxblood,borderRadius:6,padding:"6px 13px",fontSize:11.5,fontWeight:600,cursor:"pointer",flexShrink:0}}>Sign out</button>
              </div>
            </Panel>
          </div>

          <div>
            <Eyebrow style={{marginBottom:9,paddingLeft:2}}>Appearance</Eyebrow>
            <Panel pad={0}>
              <div style={{display:"flex"}}>
                {[["light","Light"],["dark","Dark"]].map(([m,l],i)=>(
                  <button key={m} onClick={()=>{if(mode!==m)toggleTheme();}} style={{flex:1,padding:"13px 0",border:"none",borderLeft:i?`1px solid ${C.rule}`:"none",background:mode===m?C.emerald:C.panel,color:mode===m?"#fff":C.ink3,fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:"0.02em"}}>{l}</button>
                ))}
              </div>
            </Panel>
          </div>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9,paddingLeft:2}}>
              <Eyebrow>Accounts</Eyebrow>
              <button onClick={()=>setSheet("add-account")} style={{background:C.panel,border:`1px solid ${C.rule2}`,color:C.emerald,borderRadius:5,padding:"5px 11px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Add account</button>
            </div>
            <Panel pad={0}>
              {state.accounts.map((a,i)=>(
                <div key={a.id}>
                  {i>0&&<Rule/>}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 15px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                      <div style={{width:3,height:22,background:a.color,borderRadius:1,flexShrink:0}}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:500,fontSize:13,color:C.ink}}>{a.name}</div>
                        <div style={{...mono,color:C.ink4,fontSize:10.5,marginTop:1}}>{a.type} · {fmt(a.balance)}</div>
                      </div>
                    </div>
                    {!CORE_IDS.has(a.id)&&<button onClick={()=>dispatch({type:"DEL_ACC",id:a.id})} style={{background:"none",border:"none",color:C.oxblood,cursor:"pointer",fontSize:11,fontWeight:600,padding:0}}>remove</button>}
                  </div>
                </div>
              ))}
            </Panel>
          </div>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9,paddingLeft:2}}>
              <Eyebrow>Categories · {cats.length}</Eyebrow>
              <button onClick={()=>setSheet("add-category")} style={{background:C.panel,border:`1px solid ${C.rule2}`,color:C.emerald,borderRadius:5,padding:"5px 11px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Add category</button>
            </div>
            <Panel>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {cats.map(c=>(
                  <div key={c} style={{background:C.panel2,border:`1px solid ${C.rule}`,borderRadius:5,padding:"5px 10px",fontSize:11.5,display:"flex",alignItems:"center",gap:5,color:C.ink2}}>
                    <span>{CAT_ICONS[c]||"📌"}</span>{c}
                    {!DEFAULT_CATS.includes(c)&&<button onClick={()=>setCats(p=>p.filter(x=>x!==c))} style={{background:"none",border:"none",color:C.oxblood,cursor:"pointer",fontSize:13,padding:0,lineHeight:1,marginLeft:2}}>×</button>}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ═══ NAV ═══ */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:640,background:C.panel,borderTop:`1px solid ${C.rule2}`,display:"flex",zIndex:100}}>
        {[["home","Balance"],["history","Ledger"],["analytics","Reading"],["advisor","Advisor"],["settings","Setup"]].map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"13px 0 17px",position:"relative"}}>
            <div style={{fontSize:11.5,fontWeight:tab===t?600:500,letterSpacing:"0.03em",color:tab===t?C.ink:C.ink4}}>{label}</div>
            {tab===t&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:22,height:2,background:C.emerald}}/>}
          </button>
        ))}
      </div>

      {tab!=="home"&&tab!=="advisor"&&(
        <button onClick={()=>setSheet("add-tx")} aria-label="New entry" style={{position:"fixed",bottom:84,right:"max(18px, calc(50% - 320px + 18px))",background:C.ink,border:"none",color:C.paper,borderRadius:8,width:48,height:48,fontSize:22,cursor:"pointer",boxShadow:"0 4px 18px rgba(22,33,29,0.22)",zIndex:99,lineHeight:1}}>+</button>
      )}

      {/* ═══ SHEETS ═══ */}
      {sheet==="add-tx"&&(
        <Sheet title="New entry" onClose={()=>setSheet(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:15}}>
            <div style={{display:"flex",border:`1px solid ${C.rule2}`,borderRadius:6,overflow:"hidden",background:C.panel}}>
              {[["expense","Money out"],["income","Money in"],["transfer","Moved"]].map(([t,l],i)=>(
                <button key={t} onClick={()=>setForm(f=>({...f,type:t}))} style={{flex:1,padding:"10px 0",border:"none",borderLeft:i?`1px solid ${C.rule2}`:"none",background:form.type===t?C.emerald:C.panel,color:form.type===t?"#fff":C.ink3,fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:"0.02em"}}>{l}</button>
              ))}
            </div>

            <div style={{textAlign:"center",padding:"10px 0 6px",borderBottom:`2px solid ${C.rule2}`}}>
              <Eyebrow style={{marginBottom:10}}>Amount</Eyebrow>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:6}}>
                <span style={{...mono,fontSize:17,color:C.ink3,fontWeight:500}}>Rs</span>
                <input type="number" placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} autoFocus style={{...disp,background:"transparent",border:"none",color:C.ink,fontSize:40,fontWeight:600,letterSpacing:"-0.03em",textAlign:"center",outline:"none",width:"70%",padding:0}}/>
              </div>
            </div>

            <Field label="What was it for"><input placeholder="Groceries at Imtiaz" value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} style={si}/></Field>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><Field label="Date"><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={si}/></Field></div>
              <div style={{flex:1}}><Field label="Category"><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={si}>{cats.map(c=><option key={c}>{c}</option>)}</select></Field></div>
            </div>
            {form.type!=="income"&&<Field label={form.type==="transfer"?"From account":"Paid from"}><select value={form.from||""} onChange={e=>setForm(f=>({...f,from:e.target.value||null}))} style={si}><option value="">—</option>{state.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
            {(form.type==="income"||form.type==="transfer")&&<Field label={form.type==="transfer"?"To account":"Received into"}><select value={form.to||""} onChange={e=>setForm(f=>({...f,to:e.target.value||null}))} style={si}><option value="">—</option>{state.accounts.filter(a=>form.type!=="transfer"||a.id!==form.from).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
            {txErr&&<div style={{color:C.oxblood,fontSize:12.5,background:C.oxSoft,padding:"10px 13px",borderRadius:6}}>{txErr}</div>}
            <button onClick={addTx} style={{background:C.emerald,color:"#fff",border:"none",borderRadius:7,padding:15,fontWeight:600,fontSize:15,cursor:"pointer",letterSpacing:"0.01em"}}>Record entry</button>
          </div>
        </Sheet>
      )}

      {sheet==="add-account"&&(
        <Sheet title="Add account" onClose={()=>setSheet(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:15}}>
            <Field label="Name"><input placeholder="JazzCash, NayaPay…" value={accForm.name} onChange={e=>setAccForm(f=>({...f,name:e.target.value}))} style={si} autoFocus/></Field>
            <Field label="Current balance — negative for a loan"><input type="number" placeholder="0" value={accForm.balance} onChange={e=>setAccForm(f=>({...f,balance:e.target.value}))} style={SI({...mono})}/></Field>
            <Field label="Kind"><select value={accForm.type} onChange={e=>setAccForm(f=>({...f,type:e.target.value}))} style={si}><option value="bank">Bank</option><option value="wallet">Mobile wallet</option><option value="cash">Cash</option><option value="investment">Investment</option><option value="loan">Loan or liability</option><option value="other">Other</option></select></Field>
            <Field label="Colour"><div style={{display:"flex",gap:8,flexWrap:"wrap",paddingTop:2}}>{ACCT_COLORS.map(clr=><button key={clr} onClick={()=>setAccForm(f=>({...f,color:clr}))} aria-label={clr} style={{width:28,height:28,borderRadius:5,background:clr,cursor:"pointer",border:accForm.color===clr?`2px solid ${C.ink}`:`1px solid ${C.rule2}`,outline:accForm.color===clr?`2px solid ${C.paper}`:"none",outlineOffset:-4}}/>)}</div></Field>
            {accErr&&<div style={{color:C.oxblood,fontSize:12.5,background:C.oxSoft,padding:"10px 13px",borderRadius:6}}>{accErr}</div>}
            <button onClick={addAcc} style={{background:C.emerald,color:"#fff",border:"none",borderRadius:7,padding:15,fontWeight:600,fontSize:15,cursor:"pointer"}}>Add account</button>
          </div>
        </Sheet>
      )}

      {sheet==="add-category"&&(
        <Sheet title="Add category" onClose={()=>setSheet(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:15}}>
            <Field label="Name"><input placeholder="Petrol, wedding gift…" value={catInput} onChange={e=>setCatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCat()} style={si} autoFocus/></Field>
            {catErr&&<div style={{color:C.oxblood,fontSize:12.5,background:C.oxSoft,padding:"10px 13px",borderRadius:6}}>{catErr}</div>}
            <button onClick={addCat} style={{background:C.emerald,color:"#fff",border:"none",borderRadius:7,padding:15,fontWeight:600,fontSize:15,cursor:"pointer"}}>Add category</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ── Auth screens: signup / login ── */
function AuthScreen({onAuthed}){
  useThemeSync();
  const [mode,setMode]=useState("login"); // login | signup
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  async function submit(){
    setErr("");
    if(mode==="signup" && password!==confirm){ setErr("Passwords don't match."); return; }
    setBusy(true);
    try{
      const session = mode==="signup"
        ? await AUTH_BACKEND.signUp(email, password)
        : await AUTH_BACKEND.signIn(email, password);
      onAuthed(session);
    }catch(e){
      setErr(e.message || "Something went wrong.");
    }finally{
      setBusy(false);
    }
  }

  const si = SI();

  return (
    <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",background:C.paper,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{...disp,fontSize:30,fontWeight:600,letterSpacing:"-0.02em",color:C.ink,marginBottom:6}}>Bahi Khata</div>
          <div style={{fontSize:12.5,color:C.ink3}}>Your ledger, kept privately, only for you.</div>
        </div>

        <Panel pad={0}>
          <div style={{display:"flex",borderBottom:`1px solid ${C.rule}`}}>
            {[["login","Log in"],["signup","Sign up"]].map(([m,l])=>(
              <button key={m} onClick={()=>{setMode(m);setErr("");}} style={{flex:1,padding:"14px 0",border:"none",background:"transparent",color:mode===m?C.ink:C.ink4,fontWeight:mode===m?600:500,fontSize:13.5,cursor:"pointer",position:"relative"}}>
                {l}
                {mode===m&&<div style={{position:"absolute",bottom:-1,left:"50%",transform:"translateX(-50%)",width:28,height:2,background:C.emerald}}/>}
              </button>
            ))}
          </div>

          <div style={{padding:20,display:"flex",flexDirection:"column",gap:13}}>
            <Field label="Email">
              <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} style={si} onKeyDown={e=>e.key==="Enter"&&submit()}/>
            </Field>
            <Field label="Password">
              <input type="password" autoComplete={mode==="signup"?"new-password":"current-password"} placeholder="At least 6 characters" value={password} onChange={e=>setPassword(e.target.value)} style={si} onKeyDown={e=>e.key==="Enter"&&submit()}/>
            </Field>
            {mode==="signup" && (
              <Field label="Confirm password">
                <input type="password" autoComplete="new-password" placeholder="Re-enter password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={si} onKeyDown={e=>e.key==="Enter"&&submit()}/>
              </Field>
            )}
            {err && <div style={{color:C.oxblood,fontSize:12.5,background:C.oxSoft,padding:"10px 13px",borderRadius:6}}>{err}</div>}
            <button onClick={submit} disabled={busy || !email || !password} style={{
              background: (busy||!email||!password) ? C.panel2 : C.emerald,
              color: (busy||!email||!password) ? C.ink4 : "#fff",
              border:"none",borderRadius:7,padding:14,fontWeight:600,fontSize:14.5,
              cursor:(busy||!email||!password)?"default":"pointer",marginTop:4
            }}>{busy ? "Please wait…" : mode==="signup" ? "Create account" : "Log in"}</button>
          </div>
        </Panel>

        <div style={{textAlign:"center",color:C.ink4,fontSize:11,marginTop:16,lineHeight:1.6}}>
          {hasSupabase
            ? "Connected to Supabase — your account and ledger sync across devices."
            : "Running without a backend attached — accounts are stored locally to this session for testing."}
        </div>
      </div>
    </div>
  );
}

/* ── Root: resolves the session, then shows AuthScreen or Workspace ── */
export default function App(){
  const [checking,setChecking]=useState(true);
  const [session,setSession]=useState(null);

  useEffect(()=>{ (async()=>{
    const s = await AUTH_BACKEND.currentSession();
    if(s) setSession(s);
    setChecking(false);
  })(); },[]);

  async function handleLogout(){
    await AUTH_BACKEND.signOut();
    setSession(null);
  }

  if(checking){
    return (
      <div style={{fontFamily:"'IBM Plex Sans',system-ui,sans-serif",background:LIGHT.paper,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{color:LIGHT.ink3,fontSize:13}}>Loading…</div>
      </div>
    );
  }

  if(!session){
    return <AuthScreen onAuthed={setSession}/>;
  }

  return <Workspace userId={session.id} userEmail={session.email} onLogout={handleLogout}/>;
}
