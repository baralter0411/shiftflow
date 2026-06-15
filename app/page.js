"use client";

// ═══ ShiftFlow — 主程式 ═══
// 這個檔案包含完整的前端邏輯
// 資料存取透過 lib/supabase.js 連接 Supabase 資料庫
// 部署到 Vercel 後，所有員工都能透過網址存取

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  loadShopConfig, saveShopConfig,
  loadStaff, addStaffMember, updateStaffMember,
  loadHolidays, saveHolidays,
  loadEvents, saveEvent, deleteEvent,
  loadRestDays, toggleRestDay as dbToggleRest,
  loadSchedule, saveSchedule,
  loadLeaveRequests, addLeaveRequest, updateLeaveStatus,
  loadPublishInfo, savePublishLog,
} from "../lib/supabase";

// ─── 常數 ───
const DW = ["日", "一", "二", "三", "四", "五", "六"];
const ACCENT = "#534AB7";
const ACCENT_L = "#EEEDFE";
const ACCENT_D = "#3C3489";

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getDow(y, m, d) { return new Date(y, m, d).getDay(); }
function getFirst(y, m) { return new Date(y, m, 1).getDay(); }
function formatMoney(n) { return "$" + Math.round(n).toLocaleString(); }

// ─── 排班引擎 ───
function generateSchedule(staffList, restDays, holidays, events, config) {
  // 這裡的參數格式跟 artifact 版一樣
  // config.shifts, config.needs, etc.
  const year = config._year;
  const month = config._month;
  const totalDays = daysInMonth(year, month);
  const active = staffList.filter((s) => s.active);
  const sch = {};

  for (let day = 1; day <= totalDays; day++) {
    if (holidays.includes(day)) continue;
    const dow = getDow(year, month, day);
    const assignments = [];

    for (const shift of config.shifts) {
      if (!shift.dow.includes(dow)) continue;
      const need = config.needs[shift.id] || [1, 2];
      const extra = events[String(day)]?.extra || 0;
      const target = need[1] + extra;

      const pool = active
        .filter((s) => !restDays[s.id + "-" + day] && !assignments.some((a) => a.id === s.id && a.shift === shift.id))
        .map((s) => {
          let score = 0;
          const total = Object.values(sch).flat().filter((a) => a.id === s.id).length;
          score -= total * 2;
          if (s.type === "正") score += 3;
          let consecutive = 0;
          for (let p = day - 1; p >= Math.max(1, day - 6); p--) {
            if (sch[p]?.some((a) => a.id === s.id)) consecutive++;
            else break;
          }
          if (consecutive >= 5) score -= 20;
          if (consecutive >= 4) score -= 5;
          return { ...s, score };
        })
        .sort((a, b) => b.score - a.score);

      const count = Math.min(pool.length, target);
      for (let i = 0; i < count; i++) {
        assignments.push({ id: pool[i].id, shift: shift.id });
      }
    }
    sch[day] = assignments;
  }
  return sch;
}

// ─── Styles ───
const card = { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14, marginBottom: 14 };
const inp = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 12, color: "var(--color-text-primary)", background: "var(--color-background-primary)", boxSizing: "border-box" };
const lbl = { fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3, display: "block" };
const metric = { background: "var(--color-background-secondary)", borderRadius: 8, padding: "12px 14px" };

function btn(primary, danger) {
  return { padding: "5px 12px", fontSize: 12, borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, border: primary || danger ? "none" : "0.5px solid var(--color-border-secondary)", background: primary ? ACCENT : danger ? "#E24B4A" : "transparent", color: primary || danger ? "#fff" : "var(--color-text-primary)" };
}
function navSt(active) {
  return { display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, background: active ? ACCENT_L : "transparent", color: active ? ACCENT : "var(--color-text-secondary)", fontWeight: active ? 500 : 400 };
}
function tag(bg, c) {
  return { display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 8, fontSize: 10, fontWeight: 500, background: bg, color: c };
}
function alertSt(type) {
  const map = { ok: ["#EAF3DE", "#97C459", "#27500A"], warn: ["#FAEEDA", "#EF9F27", "#633806"], danger: ["#FCEBEB", "#F09595", "#791F1F"], info: [ACCENT_L, "#AFA9EC", ACCENT_D] };
  const [bg, bd, fg] = map[type] || map.info;
  return { borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 12, background: bg, border: "0.5px solid " + bd, color: fg };
}

// ═══ APP ═══
export default function Page() {
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(false);
  const [role, setRole] = useState(null);
  const [loginTab, setLoginTab] = useState("mgr");
  const [loginPw, setLoginPw] = useState("");
  const [loginSid, setLoginSid] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [config, setConfig] = useState(null);
  const [staff, setStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [draftHols, setDraftHols] = useState([]);
  const [events, setEvents] = useState({});
  const [restDays, setRestDays] = useState({});
  const [schedule, setSchedule] = useState({});
  const [publishInfo, setPublishInfo] = useState(null);
  const [leaves, setLeaves] = useState([]);

  const [pg, setPg] = useState("overview");
  const [yr, setYr] = useState(2025);
  const [mo, setMo] = useState(new Date().getMonth());

  // Form states
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("PT");
  const [newRate, setNewRate] = useState("160");
  const [newAL, setNewAL] = useState("0");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editALT, setEditALT] = useState("");
  const [editALU, setEditALU] = useState("");
  const [removeId, setRemoveId] = useState(null);
  const [pwEditId, setPwEditId] = useState(null);
  const [pwVal, setPwVal] = useState("");
  const [mgrPwVal, setMgrPwVal] = useState("");
  const [evtD, setEvtD] = useState("");
  const [evtN, setEvtN] = useState("");
  const [evtX, setEvtX] = useState(1);
  const [submitOk, setSubmitOk] = useState("");
  const [lvS, setLvS] = useState("");
  const [lvE, setLvE] = useState("");
  const [lvR, setLvR] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [aiL, setAiL] = useState(false);

  const isMgr = role === "mgr";
  const me = staff.find((s) => s.id === role);
  const active = staff.filter((s) => s.active);
  const D = config ? daysInMonth(yr, mo) : 30;

  // ─── 從 Supabase 載入資料 ───
  async function loadAllData() {
    setLoading(true);
    try {
      const [cfg, staffData, hols, evtsData, rests, schData, leavesData, pubInfo] = await Promise.all([
        loadShopConfig(),
        loadStaff(),
        loadHolidays(yr, mo),
        loadEvents(yr, mo),
        loadRestDays(yr, mo),
        loadSchedule(yr, mo),
        loadLeaveRequests(),
        loadPublishInfo(yr, mo),
      ]);
      if (cfg) setConfig(cfg);
      setStaff(staffData);
      setHolidays(hols);
      setDraftHols(hols);
      setEvents(evtsData);
      setRestDays(rests);
      setSchedule(schData);
      setLeaves(leavesData);
      setPublishInfo(pubInfo);
    } catch (err) {
      console.error("載入失敗", err);
    }
    setLoading(false);
  }

  useEffect(() => { loadAllData(); }, [yr, mo]);

  // ─── 登入 ───
  function doLogin() {
    setLoginErr("");
    if (loginTab === "mgr") {
      if (loginPw === config?.mgrPassword) { setRole("mgr"); setLogged(true); setPg("overview"); }
      else setLoginErr("密碼錯誤");
    } else {
      if (!loginSid) { setLoginErr("請選擇員工"); return; }
      const s = staff.find((x) => x.id === loginSid);
      if (!s || !s.active) { setLoginErr("帳號無效"); return; }
      if (loginPw === s.pw) { setRole(s.id); setLogged(true); setPg("myshift"); }
      else setLoginErr("密碼錯誤");
    }
    setLoginPw("");
  }

  // ─── 資料操作（寫入 Supabase）───
  async function handleUpdateStaff(id, updates) {
    await updateStaffMember(id, updates);
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  async function handleAddStaff() {
    if (!newName.trim()) return;
    const result = await addStaffMember({
      name: newName.trim(), type: newType,
      rate: newType === "PT" ? parseInt(newRate) || 0 : 0,
      alTotal: newType === "正" ? parseInt(newAL) || 0 : 0,
    });
    if (result) {
      setStaff((prev) => [...prev, {
        id: result.id, name: result.name, type: result.type,
        rate: result.rate, alTotal: result.annual_total, alUsed: 0,
        pw: "1234", canView: true, canEdit: false, active: true,
      }]);
    }
    setNewName(""); setNewRate("160"); setNewAL("0"); setShowAdd(false);
  }

  async function handleToggleRest(staffId, day) {
    const added = await dbToggleRest(staffId, yr, mo, day);
    setRestDays((prev) => {
      const key = staffId + "-" + day;
      const next = { ...prev };
      if (added) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  async function handlePublish() {
    await saveHolidays(yr, mo, draftHols);
    await savePublishLog(yr, mo);
    setHolidays([...draftHols]);
    setPublishInfo({ published_at: new Date().toISOString() });
  }

  async function handleSaveConfig(newCfg) {
    setConfig(newCfg);
    await saveShopConfig(newCfg);
  }

  async function handleRunAI() {
    if (!config) return;
    setAiL(true);
    setAiMsg("AI 排班中⋯");
    const result = generateSchedule(staff, restDays, holidays, events, { ...config, _year: yr, _month: mo });
    setSchedule(result);
    await saveSchedule(yr, mo, result);
    setAiMsg("排班完成！請到月班表查看結果。");
    setAiL(false);
  }

  async function handleAddEvent() {
    if (!evtD || !evtN) return;
    await saveEvent(yr, mo, evtD, evtN, evtX);
    setEvents((prev) => ({ ...prev, [evtD]: { name: evtN, extra: evtX } }));
    setEvtD(""); setEvtN("");
  }

  async function handleDeleteEvent(day) {
    await deleteEvent(yr, mo, day);
    setEvents((prev) => { const n = { ...prev }; delete n[day]; return n; });
  }

  async function handleSubmitLeave() {
    if (!lvS) return;
    const end = lvE || lvS;
    const start = new Date(lvS);
    const endDate = new Date(end);
    for (let d = new Date(start); d <= endDate; d.setDate(d.getDate() + 1)) {
      await addLeaveRequest(role, d.toISOString().slice(0, 10), lvR || "無");
    }
    setLvS(""); setLvE(""); setLvR("");
    const updated = await loadLeaveRequests();
    setLeaves(updated);
  }

  async function handleLeaveAction(id, status) {
    await updateLeaveStatus(id, status);
    setLeaves((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    // 如果批准，更新年假
    if (status === "approved") {
      const req = leaves.find((r) => r.id === id);
      const emp = staff.find((s) => s.id === req?.staffId);
      if (emp?.type === "正") {
        await handleUpdateStaff(emp.id, { alUsed: (emp.alUsed || 0) + 1 });
      }
    }
  }

  // ─── 計算 ───
  const gaps = [];
  if (config) {
    for (let d = 1; d <= D; d++) {
      if (holidays.includes(d)) continue;
      const dow = getDow(yr, mo, d);
      for (const sh of config.shifts) {
        if (!sh.dow.includes(dow)) continue;
        const need = config.needs[sh.id] || [1, 2];
        const cnt = (schedule[d] || []).filter((a) => a.shift === sh.id).length;
        const ex = events[String(d)]?.extra || 0;
        if (cnt < need[0] + ex) gaps.push({ d, sh, need: need[0] + ex, have: cnt, lv: "danger" });
        else if (cnt < need[1] + ex) gaps.push({ d, sh, need: need[1] + ex, have: cnt, lv: "warn" });
      }
    }
  }

  const ptCosts = staff.filter((s) => s.type === "PT" && s.active).map((s) => {
    let hours = 0, nightHours = 0, cost = 0;
    if (config) {
      for (let d = 1; d <= D; d++) {
        (schedule[d] || []).forEach((a) => {
          if (a.id !== s.id) return;
          const sh = config.shifts.find((x) => x.id === a.shift);
          if (!sh) return;
          if (sh.nightX > 0) { nightHours += sh.hours; cost += s.rate * sh.hours * sh.nightX; }
          else { hours += sh.hours; cost += s.rate * sh.hours; }
        });
      }
    }
    return { ...s, hours, nightHours, cost: Math.round(cost) };
  });
  const ptTotal = ptCosts.reduce((sum, p) => sum + p.cost, 0);
  const pendingLeaves = leaves.filter((r) => r.status === "pending");

  // ═══ LOADING ═══
  if (loading || !config) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 52, height: 52, background: ACCENT, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24, marginBottom: 12 }}>
            <i className="ti ti-glass-full" />
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>載入中⋯</div>
        </div>
      </div>
    );
  }

  // ═══ LOGIN ═══
  if (!logged) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "var(--font-sans)" }}>
        <div style={{ width: 340, ...card, padding: "28px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, background: ACCENT, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24, marginBottom: 8 }}>
              <i className="ti ti-glass-full" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>{config.shopName}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>智慧排班系統</div>
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--color-background-secondary)", borderRadius: 8, padding: 2 }}>
            {[["mgr", "管理者"], ["emp", "員工"]].map(([k, l]) => (
              <button key={k} onClick={() => { setLoginTab(k); setLoginErr(""); setLoginSid(""); }}
                style={{ flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "none",
                  background: loginTab === k ? "var(--color-background-primary)" : "transparent",
                  color: loginTab === k ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  fontWeight: loginTab === k ? 500 : 400,
                  boxShadow: loginTab === k ? "0 0 0 0.5px var(--color-border-secondary)" : "none" }}>
                {l}
              </button>
            ))}
          </div>

          {loginTab === "emp" && (
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>選擇身份</div>
              <select value={loginSid} onChange={(e) => setLoginSid(e.target.value)} style={inp}>
                <option value="">-- 請選擇 --</option>
                {active.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={lbl}>密碼</div>
            <input type="password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doLogin(); }}
              placeholder="輸入密碼" style={inp} />
          </div>

          {loginErr && <div style={{ fontSize: 12, color: "#A32D2D", marginBottom: 12, textAlign: "center" }}>{loginErr}</div>}

          <button onClick={doLogin} style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 500, border: "none", borderRadius: 8, cursor: "pointer", background: ACCENT, color: "#fff" }}>
            登入
          </button>
        </div>
      </div>
    );
  }

  // ═══ NAV ═══
  const mgrNav = [
    { id: "overview", icon: "ti-layout-dashboard", label: "總覽" },
    { id: "calendar", icon: "ti-calendar-month", label: "月班表" },
    { id: "publish", icon: "ti-send", label: "發布月曆" },
    { id: "staffview", icon: "ti-eye", label: "員工填報" },
    { id: "staffmgr", icon: "ti-users", label: "員工管理" },
    { id: "perms", icon: "ti-lock", label: "權限密碼" },
    { id: "leavemgr", icon: "ti-beach", label: "休假管理", badge: pendingLeaves.length || null },
    { id: "budget", icon: "ti-coin", label: "PT 預算" },
    { id: "gap", icon: "ti-alert-triangle", label: "缺口", badge: gaps.length || null },
    { id: "setup", icon: "ti-settings", label: "系統設定" },
  ];
  const empNav = [
    { id: "myshift", icon: "ti-calendar-user", label: "我的班表" },
    { id: "submit", icon: "ti-clock", label: "填報休假日" },
    { id: "myleave", icon: "ti-beach", label: "休假申請" },
  ];
  const nav = isMgr ? mgrNav : empNav;

  // 由於完整 UI 程式碼過長，這裡提供核心架構
  // 完整的各頁面 JSX 請從 artifact 版本 (bar-alter-scheduler.jsx) 複製過來
  // 唯一需要修改的是：
  // 1. updateStaffById → handleUpdateStaff (async)
  // 2. toggleRestDay → handleToggleRest (async)
  // 3. handlePublish 已經連接 Supabase
  // 4. handleRunAI 會自動存到 Supabase
  // 5. handleSubmitLeave 會寫入 Supabase

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)" }}>
      {/* 側欄 */}
      <aside style={{ width: 196, background: "var(--color-background-primary)", borderRight: "0.5px solid var(--color-border-tertiary)", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, background: ACCENT, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13 }}>
            <i className="ti ti-glass-full" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{config.shopName}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{isMgr ? "管理者" : me?.name}</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {nav.map((n) => (
            <div key={n.id} onClick={() => setPg(n.id)} style={navSt(pg === n.id)}>
              <i className={"ti " + n.icon} style={{ fontSize: 15 }} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.badge > 0 && <span style={{ background: "#E24B4A", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 8 }}>{n.badge}</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 10px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          <button onClick={() => { setLogged(false); setRole(null); setLoginPw(""); }}
            style={{ ...btn(), width: "100%", justifyContent: "center", fontSize: 11, padding: "5px 0", color: "var(--color-text-tertiary)" }}>
            <i className="ti ti-logout" /> 登出
          </button>
        </div>
      </aside>

      {/* 主要內容 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* 頂部 */}
        <div style={{ height: 48, background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", padding: "0 16px", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{nav.find((n) => n.id === pg)?.label}</span>
          <button onClick={() => { if (mo === 0) { setMo(11); setYr((y) => y - 1); } else setMo((m) => m - 1); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            <i className="ti ti-chevron-left" />
          </button>
          <span style={{ fontSize: 12, fontWeight: 500, minWidth: 72, textAlign: "center" }}>
            {yr}/{String(mo + 1).padStart(2, "0")}
          </span>
          <button onClick={() => { if (mo === 11) { setMo(0); setYr((y) => y + 1); } else setMo((m) => m + 1); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            <i className="ti ti-chevron-right" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {/* 各頁面內容 — 從 artifact 版本的對應區塊複製過來 */}
          {/* 唯一差異：資料操作改用上面的 async 函式 */}

          {pg === "overview" && isMgr && (
            <div>
              {publishInfo && <div style={alertSt("info")}><i className="ti ti-check" /> {mo + 1}月已發布</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 16 }}>
                <div style={metric}><div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>員工</div><div style={{ fontSize: 18, fontWeight: 500 }}>{active.length}</div></div>
                <div style={metric}><div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>缺口</div><div style={{ fontSize: 18, fontWeight: 500, color: gaps.length ? "#A32D2D" : "#0F6E56" }}>{gaps.length}</div></div>
                <div style={metric}><div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>PT費</div><div style={{ fontSize: 18, fontWeight: 500 }}>{formatMoney(ptTotal)}</div></div>
                <div style={metric}><div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>待審</div><div style={{ fontSize: 18, fontWeight: 500 }}>{pendingLeaves.length}</div></div>
              </div>

              <div style={{ ...card, background: ACCENT_L, border: "0.5px solid #AFA9EC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, background: ACCENT, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                    <i className="ti ti-robot" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: "#26215C" }}>AI 排班</span>
                  <button onClick={handleRunAI} disabled={aiL} style={{ ...btn(true), opacity: aiL ? 0.6 : 1 }}>
                    <i className="ti ti-wand" /> {aiL ? "排班中..." : "一鍵排班"}
                  </button>
                </div>
                {aiMsg && <div style={{ background: "rgba(255,255,255,.6)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: ACCENT_D, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{aiMsg}</div>}
              </div>

              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: 16, textAlign: "center", background: "var(--color-background-secondary)", borderRadius: 8 }}>
                完整 UI 請從 artifact 版本複製各頁面的 JSX 到此檔案。
                <br />架構已連接 Supabase，資料操作函式已準備好。
              </div>
            </div>
          )}

          {pg === "myshift" && !isMgr && (
            <div>
              {publishInfo && <div style={alertSt("info")}><i className="ti ti-bell" /> {mo + 1}月已發布</div>}
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{me?.name} 的 {mo + 1}月班表</div>
                {(() => {
                  const myShifts = [];
                  for (let d = 1; d <= D; d++) {
                    (schedule[d] || []).forEach((a) => {
                      if (a.id === role) myShifts.push({ day: d, shift: a.shift });
                    });
                  }
                  if (!myShifts.length) return <div style={{ textAlign: "center", padding: 20, color: "var(--color-text-tertiary)", fontSize: 12 }}>尚無排班</div>;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {myShifts.map((ms, i) => {
                        const sh = config.shifts.find((x) => x.id === ms.shift) || config.shifts[0];
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: sh.bg, borderRadius: 8 }}>
                            <div style={{ minWidth: 48, textAlign: "center" }}>
                              <div style={{ fontSize: 10, color: sh.fg }}>{DW[getDow(yr, mo, ms.day)]}</div>
                              <div style={{ fontSize: 16, fontWeight: 500, color: sh.fg }}>{mo + 1}/{ms.day}</div>
                            </div>
                            <div style={{ width: 1, height: 30, background: sh.bd }} />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: sh.fg }}>{sh.label}</div>
                              <div style={{ fontSize: 11, color: sh.fg, opacity: 0.8 }}>{sh.start}–{sh.end} · {sh.hours}h</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 其他頁面：從 artifact 版 (bar-alter-scheduler.jsx) 複製 */}
          {!["overview", "myshift"].includes(pg) && (
            <div style={{ ...card, textAlign: "center", padding: 30, color: "var(--color-text-tertiary)" }}>
              <i className="ti ti-code" style={{ fontSize: 28, marginBottom: 8, display: "block" }} />
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>此頁面需要從 artifact 版本複製</div>
              <div style={{ fontSize: 12 }}>
                把 bar-alter-scheduler.jsx 中對應的 {`{pg === "${pg}"}`} 區塊<br />
                複製到這裡，並把資料操作改用 async 版本即可。
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
