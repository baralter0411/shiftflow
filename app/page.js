"use client";
import { useState, useEffect, useRef } from "react";
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

const DW=["日","一","二","三","四","五","六"];
const A="#534AB7",AL="#EEEDFE",AD="#3C3489";
const dIn=(y,m)=>new Date(y,m+1,0).getDate();
const gd=(y,m,d)=>new Date(y,m,d).getDay();
const f1=(y,m)=>new Date(y,m,1).getDay();
const fm=n=>"$"+Math.round(n).toLocaleString();

function autoSch(staff,rests,hols,evts,cfg,Y,M){
  const D=dIn(Y,M),act=staff.filter(s=>s.active),sch={};
  for(let d=1;d<=D;d++){
    if(hols.includes(d))continue;
    const w=gd(Y,M,d),asgn=[];
    for(const sh of cfg.shifts){
      if(!sh.dow.includes(w))continue;
      const nd=cfg.needs[sh.id]||[1,2],ex=evts[String(d)]?.extra||0,tgt=nd[1]+ex;
      const pool=act.filter(s=>!rests[s.id+"-"+d]&&!asgn.some(a=>a.id===s.id&&a.shift===sh.id))
        .map(s=>{let sc=0;const tot=Object.values(sch).flat().filter(a=>a.id===s.id).length;sc-=tot*2;if(s.type==="正")sc+=3;
          let cn=0;for(let p=d-1;p>=Math.max(1,d-6);p--){if(sch[p]?.some(a=>a.id===s.id))cn++;else break;}if(cn>=5)sc-=20;if(cn>=4)sc-=5;return{...s,sc};})
        .sort((a,b)=>b.sc-a.sc);
      for(let i=0;i<Math.min(pool.length,tgt);i++)asgn.push({id:pool[i].id,shift:sh.id});
    }
    sch[d]=asgn;
  }
  return sch;
}

const cd={background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:14,marginBottom:14};
const ip={width:"100%",padding:"7px 10px",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,fontSize:12,color:"var(--color-text-primary)",background:"var(--color-background-primary)",boxSizing:"border-box"};
const lb={fontSize:11,color:"var(--color-text-secondary)",marginBottom:3,display:"block"};
const mc={background:"var(--color-background-secondary)",borderRadius:8,padding:"12px 14px"};
function bt(p,d){return{padding:"5px 12px",fontSize:12,borderRadius:8,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,border:p||d?"none":"0.5px solid var(--color-border-secondary)",background:p?A:d?"#E24B4A":"transparent",color:p||d?"#fff":"var(--color-text-primary)"};}
function nv(a){return{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",cursor:"pointer",fontSize:12,background:a?AL:"transparent",color:a?A:"var(--color-text-secondary)",fontWeight:a?500:400};}
function tg(bg,c){return{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:8,fontSize:10,fontWeight:500,background:bg,color:c};}
function al(t){const m={ok:["#EAF3DE","#97C459","#27500A"],warn:["#FAEEDA","#EF9F27","#633806"],danger:["#FCEBEB","#F09595","#791F1F"],info:[AL,"#AFA9EC",AD]};const[bg,bd,fg]=m[t]||m.info;return{borderRadius:8,padding:"10px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:8,fontSize:12,background:bg,border:"0.5px solid "+bd,color:fg};}

export default function Page(){
  const[loading,setLoading]=useState(true);
  const[logged,setLogged]=useState(false);
  const[role,setRole]=useState(null);
  const[ltab,setLtab]=useState("mgr");
  const[lpw,setLpw]=useState("");
  const[lsid,setLsid]=useState("");
  const[lerr,setLerr]=useState("");

  const[cfg,setCfg]=useState(null);
  const[staff,setStaff]=useState([]);
  const[hols,setHols]=useState([]);
  const[draftH,setDraftH]=useState([]);
  const[evts,setEvts]=useState({});
  const[rests,setRests]=useState({});
  const[sch,setSch]=useState({});
  const[pubInfo,setPubInfo]=useState(null);
  const[leaves,setLeaves]=useState([]);

  const[pg,setPg]=useState("overview");
  const[yr,setYr]=useState(2025);
  const[mo,setMo]=useState(new Date().getMonth());

  const[showAdd,setShowAdd]=useState(false);
  const[nName,setNName]=useState("");const[nType,setNType]=useState("PT");const[nRate,setNRate]=useState("160");const[nAL,setNAL]=useState("0");
  const[eId,setEId]=useState(null);const[eName,setEName]=useState("");const[eRate,setERate]=useState("");const[eALT,setEALT]=useState("");const[eALU,setEALU]=useState("");
  const[rmId,setRmId]=useState(null);
  const[pwId,setPwId]=useState(null);const[pwV,setPwV]=useState("");const[mPw,setMPw]=useState("");
  const[evD,setEvD]=useState("");const[evN,setEvN]=useState("");const[evX,setEvX]=useState(1);
  const[subOk,setSubOk]=useState("");
  const[lvS,setLvS]=useState("");const[lvE,setLvE]=useState("");const[lvR,setLvR]=useState("");
  const[aiMsg,setAiMsg]=useState("");const[aiL,setAiL]=useState(false);

  const isMgr=role==="mgr";
  const me=staff.find(s=>s.id===role);
  const act=staff.filter(s=>s.active);
  const inact=staff.filter(s=>!s.active);
  const D=cfg?dIn(yr,mo):30;
  const pendL=leaves.filter(r=>r.status==="pending");
  const cntRest=sid=>{let c=0;for(let d=1;d<=D;d++)if(rests[sid+"-"+d])c++;return c;};

  async function loadAll(){
    setLoading(true);
    try{
      const[c,s,h,e,r,sc,l,p]=await Promise.all([loadShopConfig(),loadStaff(),loadHolidays(yr,mo),loadEvents(yr,mo),loadRestDays(yr,mo),loadSchedule(yr,mo),loadLeaveRequests(),loadPublishInfo(yr,mo)]);
      if(c)setCfg(c);setStaff(s);setHols(h);setDraftH(h);setEvts(e);setRests(r);setSch(sc);setLeaves(l);setPubInfo(p);
    }catch(err){console.error(err);}
    setLoading(false);
  }
  useEffect(()=>{loadAll();},[yr,mo]);

  function doLogin(){
    setLerr("");
    if(ltab==="mgr"){if(lpw===cfg?.mgrPassword){setRole("mgr");setLogged(true);setPg("overview");}else setLerr("密碼錯誤");}
    else{if(!lsid){setLerr("請選擇員工");return;}const s=staff.find(x=>x.id===lsid);if(!s||!s.active){setLerr("帳號無效");return;}if(lpw===s.pw){setRole(s.id);setLogged(true);setPg("myshift");}else setLerr("密碼錯誤");}
    setLpw("");
  }

  async function updS(id,u){await updateStaffMember(id,u);setStaff(p=>p.map(s=>s.id===id?{...s,...u}:s));}
  async function doAddStaff(){if(!nName.trim())return;const r=await addStaffMember({name:nName.trim(),type:nType,rate:nType==="PT"?parseInt(nRate)||0:0,alTotal:nType==="正"?parseInt(nAL)||0:0});if(r)setStaff(p=>[...p,{id:r.id,name:r.name,type:r.type,rate:r.rate,alTotal:r.annual_total,alUsed:0,pw:"1234",canView:true,canEdit:false,active:true}]);setNName("");setNRate("160");setNAL("0");setShowAdd(false);}
  function startEdit(e){setEId(e.id);setEName(e.name);setERate(String(e.rate));setEALT(String(e.alTotal));setEALU(String(e.alUsed));}
  async function saveEdit(){await updS(eId,{name:eName,rate:parseInt(eRate)||0,alTotal:parseInt(eALT)||0,alUsed:parseInt(eALU)||0});setEId(null);}
  async function doRm(id){await updS(id,{active:false});setRmId(null);}

  async function publish(){await saveHolidays(yr,mo,draftH);await savePublishLog(yr,mo);setHols([...draftH]);setPubInfo({published_at:new Date().toISOString()});}
  async function togRest(sid,d){const added=await dbToggleRest(sid,yr,mo,d);setRests(p=>{const n={...p};if(added)n[sid+"-"+d]=true;else delete n[sid+"-"+d];return n;});}

  async function runAI(){if(!cfg)return;setAiL(true);setAiMsg("排班中⋯");const r=autoSch(staff,rests,hols,evts,cfg,yr,mo);setSch(r);await saveSchedule(yr,mo,r);setAiMsg("排班完成！");setAiL(false);}

  async function doAddEvt(){if(!evD||!evN)return;await saveEvent(yr,mo,evD,evN,evX);setEvts(p=>({...p,[evD]:{name:evN,extra:evX}}));setEvD("");setEvN("");}
  async function doDelEvt(d){await deleteEvent(yr,mo,d);setEvts(p=>{const n={...p};delete n[d];return n;});}

  async function doSubLeave(){if(!lvS)return;const end=lvE||lvS;const s=new Date(lvS),e=new Date(end);for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))await addLeaveRequest(role,d.toISOString().slice(0,10),lvR||"無");setLvS("");setLvE("");setLvR("");const u=await loadLeaveRequests();setLeaves(u);}
  async function doLeaveAct(id,status){await updateLeaveStatus(id,status);if(status==="approved"){const req=leaves.find(r=>r.id===id);const emp=staff.find(s=>s.id===req?.staffId);if(emp?.type==="正")await updS(emp.id,{alUsed:(emp.alUsed||0)+1});}setLeaves(p=>p.map(r=>r.id===id?{...r,status}:r));}

  async function saveCfg(c){setCfg(c);await saveShopConfig(c);}

  // computed
  const gaps=[];
  if(cfg){for(let d=1;d<=D;d++){if(hols.includes(d))continue;const w=gd(yr,mo,d);for(const sh of cfg.shifts){if(!sh.dow.includes(w))continue;const nd=cfg.needs[sh.id]||[1,2];const cnt=(sch[d]||[]).filter(a=>a.shift===sh.id).length;const ex=evts[String(d)]?.extra||0;if(cnt<nd[0]+ex)gaps.push({d,sh,need:nd[0]+ex,have:cnt,lv:"danger"});else if(cnt<nd[1]+ex)gaps.push({d,sh,need:nd[1]+ex,have:cnt,lv:"warn"});}}}

  const ptC=staff.filter(s=>s.type==="PT"&&s.active).map(s=>{let h=0,nh=0,c=0;if(cfg)for(let d=1;d<=D;d++)(sch[d]||[]).forEach(a=>{if(a.id!==s.id)return;const sh=cfg.shifts.find(x=>x.id===a.shift);if(!sh)return;if(sh.nightX>0){nh+=sh.hours;c+=s.rate*sh.hours*sh.nightX;}else{h+=sh.hours;c+=s.rate*sh.hours;}});return{...s,h,nh,cost:Math.round(c)};});
  const ptTot=ptC.reduce((s,p)=>s+p.cost,0);

  function prevMo(){if(mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1);}
  function nextMo(){if(mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1);}

  if(loading||!cfg)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-sans)"}}><div style={{textAlign:"center"}}><div style={{width:52,height:52,background:A,borderRadius:12,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:24,marginBottom:12}}><i className="ti ti-glass-full"/></div><div style={{fontSize:14,color:"var(--color-text-secondary)"}}>載入中⋯</div></div></div>);

  // LOGIN
  if(!logged)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"var(--font-sans)"}}><div style={{width:340,...cd,padding:"28px 24px"}}><div style={{textAlign:"center",marginBottom:20}}><div style={{width:52,height:52,background:A,borderRadius:12,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:24,marginBottom:8}}><i className="ti ti-glass-full"/></div><div style={{fontSize:18,fontWeight:600,color:"var(--color-text-primary)"}}>{cfg.shopName}</div><div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:2}}>智慧排班系統</div></div>
    <div style={{display:"flex",gap:4,marginBottom:16,background:"var(--color-background-secondary)",borderRadius:8,padding:2}}>{[["mgr","管理者"],["emp","員工"]].map(([k,l])=><button key={k} onClick={()=>{setLtab(k);setLerr("");setLsid("");}} style={{flex:1,padding:"6px 0",fontSize:12,borderRadius:6,cursor:"pointer",border:"none",background:ltab===k?"var(--color-background-primary)":"transparent",color:ltab===k?"var(--color-text-primary)":"var(--color-text-secondary)",fontWeight:ltab===k?500:400,boxShadow:ltab===k?"0 0 0 0.5px var(--color-border-secondary)":"none"}}>{l}</button>)}</div>
    {ltab==="emp"&&<div style={{marginBottom:12}}><div style={lb}>選擇身份</div><select value={lsid} onChange={e=>setLsid(e.target.value)} style={ip}><option value="">-- 請選擇 --</option>{act.map(s=><option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}</select></div>}
    <div style={{marginBottom:16}}><div style={lb}>密碼</div><input type="password" value={lpw} onChange={e=>setLpw(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doLogin();}} placeholder="輸入密碼" style={ip}/></div>
    {lerr&&<div style={{fontSize:12,color:"#A32D2D",marginBottom:12,textAlign:"center"}}>{lerr}</div>}
    <button onClick={doLogin} style={{width:"100%",padding:"9px 0",fontSize:13,fontWeight:500,border:"none",borderRadius:8,cursor:"pointer",background:A,color:"#fff"}}>登入</button>
    <div style={{fontSize:10,color:"var(--color-text-tertiary)",textAlign:"center",marginTop:14}}>管理者：admin ／ 員工：1234</div></div></div>);

  const mNav=[{id:"overview",ic:"ti-layout-dashboard",l:"總覽"},{id:"calendar",ic:"ti-calendar-month",l:"月班表"},{id:"publish",ic:"ti-send",l:"發布月曆"},{id:"staffview",ic:"ti-eye",l:"員工填報"},{id:"staffmgr",ic:"ti-users",l:"員工管理"},{id:"perms",ic:"ti-lock",l:"權限密碼"},{id:"leavemgr",ic:"ti-beach",l:"休假管理",b:pendL.length||null},{id:"budget",ic:"ti-coin",l:"PT 預算"},{id:"gap",ic:"ti-alert-triangle",l:"缺口",b:gaps.length||null},{id:"setup",ic:"ti-settings",l:"系統設定"}];
  const eNav=[{id:"myshift",ic:"ti-calendar-user",l:"我的班表"},{id:"submit",ic:"ti-clock",l:"填報休假日"},{id:"myleave",ic:"ti-beach",l:"休假申請"}];
  const nav=isMgr?mNav:eNav;

  function renderStaff(emp){
    if(rmId===emp.id)return<div key={emp.id} style={{padding:12,background:"#FCEBEB",borderRadius:8,marginBottom:6,display:"flex",alignItems:"center",gap:8}}><span style={{flex:1,fontSize:12,color:"#791F1F"}}>確定移除 <strong>{emp.name}</strong>？</span><button onClick={()=>doRm(emp.id)} style={bt(false,true)}>確定</button><button onClick={()=>setRmId(null)} style={bt()}>取消</button></div>;
    if(eId===emp.id)return<div key={emp.id} style={{padding:12,border:"0.5px solid #AFA9EC",borderRadius:8,marginBottom:6,background:AL}}><div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:8,marginBottom:8}}><div><div style={lb}>姓名</div><input value={eName} onChange={e=>setEName(e.target.value)} style={ip}/></div><div><div style={lb}>時薪</div><input type="number" value={eRate} onChange={e=>setERate(e.target.value)} style={ip}/></div><div><div style={lb}>年假</div><input type="number" value={eALT} onChange={e=>setEALT(e.target.value)} style={ip}/></div><div><div style={lb}>已用</div><input type="number" value={eALU} onChange={e=>setEALU(e.target.value)} style={ip}/></div></div><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>setEId(null)} style={bt()}>取消</button><button onClick={saveEdit} style={bt(true)}>儲存</button></div></div>;
    return<div key={emp.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,marginBottom:6}}><div style={{width:32,height:32,borderRadius:"50%",background:AL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:500,color:AD,flexShrink:0}}>{emp.name.slice(0,2)}</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>{emp.name}<span style={tg(emp.type==="正"?"#E6F1FB":AL,emp.type==="正"?"#0C447C":AD)}>{emp.type}</span></div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{emp.type==="PT"?`$${emp.rate}/h`:`年假 ${emp.alTotal-emp.alUsed}/${emp.alTotal}`}</div></div><button onClick={()=>startEdit(emp)} style={{...bt(),fontSize:11,padding:"4px 10px"}}><i className="ti ti-edit" style={{fontSize:13}}/> 編輯</button><button onClick={()=>setRmId(emp.id)} style={{...bt(),fontSize:11,padding:"4px 10px",color:"#A32D2D",borderColor:"#F09595"}}><i className="ti ti-trash" style={{fontSize:13}}/> 移除</button></div>;
  }

  return(
    <div style={{display:"flex",minHeight:"100vh",fontFamily:"var(--font-sans)",background:"var(--color-background-tertiary)"}}>
      <aside style={{width:196,background:"var(--color-background-primary)",borderRight:"0.5px solid var(--color-border-tertiary)",flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",display:"flex",alignItems:"center",gap:8}}><div style={{width:26,height:26,background:A,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13}}><i className="ti ti-glass-full"/></div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{cfg.shopName}</div><div style={{fontSize:10,color:"var(--color-text-tertiary)"}}>{isMgr?"管理者":me?.name}</div></div></div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>{nav.map(n=><div key={n.id} onClick={()=>setPg(n.id)} style={nv(pg===n.id)}><i className={"ti "+n.ic} style={{fontSize:15}}/><span style={{flex:1}}>{n.l}</span>{n.b>0&&<span style={{background:"#E24B4A",color:"#fff",fontSize:10,padding:"1px 5px",borderRadius:8}}>{n.b}</span>}</div>)}</div>
        <div style={{padding:"8px 10px",borderTop:"0.5px solid var(--color-border-tertiary)"}}><button onClick={()=>{setLogged(false);setRole(null);setLpw("");}} style={{...bt(),width:"100%",justifyContent:"center",fontSize:11,padding:"5px 0",color:"var(--color-text-tertiary)"}}><i className="ti ti-logout"/> 登出</button></div>
      </aside>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        <div style={{height:48,background:"var(--color-background-primary)",borderBottom:"0.5px solid var(--color-border-tertiary)",display:"flex",alignItems:"center",padding:"0 16px",gap:10}}>
          <span style={{fontSize:14,fontWeight:500,flex:1,color:"var(--color-text-primary)"}}>{nav.find(n=>n.id===pg)?.l}</span>
          <button onClick={prevMo} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)"}}><i className="ti ti-chevron-left"/></button>
          <span style={{fontSize:12,fontWeight:500,minWidth:72,textAlign:"center"}}>{yr}/{String(mo+1).padStart(2,"0")}</span>
          <button onClick={nextMo} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)"}}><i className="ti ti-chevron-right"/></button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:16}}>

          {/* OVERVIEW */}
          {pg==="overview"&&isMgr&&<div>
            {pubInfo&&<div style={al("info")}><i className="ti ti-check"/> {mo+1}月已發布</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:16}}>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>員工</div><div style={{fontSize:18,fontWeight:500}}>{act.length}</div></div>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>缺口</div><div style={{fontSize:18,fontWeight:500,color:gaps.length?"#A32D2D":"#0F6E56"}}>{gaps.length}</div></div>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>PT費</div><div style={{fontSize:18,fontWeight:500}}>{fm(ptTot)}</div></div>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>待審</div><div style={{fontSize:18,fontWeight:500}}>{pendL.length}</div></div>
            </div>
            <div style={{...cd,background:AL,border:"0.5px solid #AFA9EC"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:28,height:28,background:A,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><i className="ti ti-robot"/></div><span style={{fontSize:13,fontWeight:500,flex:1,color:"#26215C"}}>AI 排班</span><button onClick={runAI} disabled={aiL} style={{...bt(true),opacity:aiL?.6:1}}><i className="ti ti-wand"/> {aiL?"排班中...":"一鍵排班"}</button></div>{aiMsg&&<div style={{background:"rgba(255,255,255,.6)",borderRadius:8,padding:"10px 12px",fontSize:12,color:AD,whiteSpace:"pre-wrap",lineHeight:1.7}}>{aiMsg}</div>}</div>
            <div style={{display:"flex",gap:8}}><button onClick={()=>setPg("publish")} style={bt()}><i className="ti ti-send"/> 發布</button></div>
          </div>}

          {/* CALENDAR */}
          {pg==="calendar"&&<div>
            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>{cfg.shifts.map(sh=><span key={sh.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:10}}><span style={{width:8,height:8,borderRadius:2,background:sh.bg,border:`0.5px solid ${sh.bd}`}}/>{sh.label}</span>)}</div>
            <div style={cd}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:540}}>
              <thead><tr>{DW.map((d,i)=><th key={i} style={{padding:"5px 4px",textAlign:"center",fontWeight:500,fontSize:10,color:i===0?"#A32D2D":"var(--color-text-secondary)",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{d}</th>)}</tr></thead>
              <tbody>{(()=>{const rows=[];let dn=1;const ff=f1(yr,mo);for(let w=0;w<6;w++){if(dn>D)break;const cells=[];for(let dd=0;dd<7;dd++){if((w===0&&dd<ff)||dn>D)cells.push(<td key={dd} style={{border:"0.5px solid var(--color-border-tertiary)"}}><div style={{minHeight:60,padding:4}}/></td>);else{const d=dn,isH=hols.includes(d),ww=gd(yr,mo,d),shifts=cfg.shifts.filter(sh=>sh.dow.includes(ww)),sc=sch[d]||[];cells.push(<td key={dd} style={{border:"0.5px solid var(--color-border-tertiary)",verticalAlign:"top",padding:0}}><div style={{minHeight:60,padding:"3px 4px",background:isH?"var(--color-background-secondary)":"transparent",opacity:isH?.6:1}}><div style={{fontSize:11,fontWeight:500,color:dd===0?"#A32D2D":"var(--color-text-secondary)",marginBottom:2}}>{d}</div>{isH?<span style={{fontSize:9,color:"var(--color-text-tertiary)"}}>公休</span>:shifts.map(sh=>{const cnt=sc.filter(a=>a.shift===sh.id).length;const nd=cfg.needs[sh.id]||[1,2];return<span key={sh.id} style={{display:"block",fontSize:9,padding:"1px 3px",borderRadius:3,background:cnt<nd[0]?"#FCEBEB":sh.bg,color:cnt<nd[0]?"#791F1F":sh.fg,marginBottom:1}}>{sh.label.slice(0,2)} {cnt}/{nd[1]}</span>;})}</div></td>);dn++;}}rows.push(<tr key={w}>{cells}</tr>);}return rows;})()}</tbody>
            </table></div></div>
            <div style={{display:"flex",gap:8}}>{isMgr&&<button onClick={runAI} disabled={aiL} style={bt(true)}><i className="ti ti-wand"/> {aiL?"...":"AI排班"}</button>}</div>
          </div>}

          {/* PUBLISH */}
          {pg==="publish"&&isMgr&&<div>
            {pubInfo&&<div style={al("ok")}><i className="ti ti-check"/> 本月已發布</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>公休日</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,fontSize:10,textAlign:"center"}}>
                  {DW.map(d=><div key={d} style={{padding:3,fontWeight:500,color:"var(--color-text-tertiary)"}}>{d}</div>)}
                  {Array.from({length:f1(yr,mo)}).map((_,i)=><div key={"e"+i}/>)}
                  {Array.from({length:D}).map((_,i)=>{const d=i+1,sel=draftH.includes(d);return<div key={d} onClick={()=>setDraftH(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])} style={{height:28,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,cursor:"pointer",fontSize:11,border:`0.5px solid ${sel?A:"var(--color-border-tertiary)"}`,background:sel?A:"transparent",color:sel?"#fff":"var(--color-text-primary)"}}>{d}</div>;})}
                </div>
                <div style={{marginTop:6,fontSize:11,color:"var(--color-text-secondary)"}}>已選 <strong style={{color:A}}>{draftH.length}</strong> 天</div>
              </div>
              <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>活動加人</div>
                {Object.entries(evts).map(([d,e])=><div key={d} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"var(--color-background-secondary)",borderRadius:6,marginBottom:4,fontSize:11}}><span style={{fontWeight:500}}>{mo+1}/{d}</span><span style={{flex:1,color:"var(--color-text-secondary)"}}>{e.name}</span><span style={tg(AL,AD)}>+{e.extra}</span><button onClick={()=>doDelEvt(d)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)"}}><i className="ti ti-trash"/></button></div>)}
                <div style={{display:"grid",gridTemplateColumns:"50px 1fr 50px auto",gap:4,marginTop:8,alignItems:"end"}}>
                  <div><div style={lb}>日</div><input type="number" min={1} max={D} value={evD} onChange={e=>setEvD(e.target.value)} style={{...ip,padding:"5px 6px"}}/></div>
                  <div><div style={lb}>名稱</div><input value={evN} onChange={e=>setEvN(e.target.value)} style={{...ip,padding:"5px 6px"}}/></div>
                  <div><div style={lb}>+</div><select value={evX} onChange={e=>setEvX(parseInt(e.target.value))} style={{...ip,padding:"5px 4px"}}>{[1,2,3,4].map(n=><option key={n} value={n}>+{n}</option>)}</select></div>
                  <button onClick={doAddEvt} style={bt(true)}><i className="ti ti-plus"/></button>
                </div>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={publish} style={bt(true)}><i className="ti ti-send"/> 發布月曆給員工</button></div>
          </div>}

          {/* STAFF VIEW */}
          {pg==="staffview"&&isMgr&&<div style={cd}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>員工休假日 — {mo+1}月</div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:12}}>✓ = 休息</div>
            <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:10}}><thead><tr><th style={{padding:"5px 8px",textAlign:"left",fontWeight:500,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",position:"sticky",left:0,zIndex:1,color:"var(--color-text-secondary)"}}>員工</th>{Array.from({length:D}).map((_,i)=>{const d=i+1;return<th key={d} style={{padding:"3px 2px",textAlign:"center",fontSize:8,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",minWidth:22,color:hols.includes(d)?"var(--color-text-tertiary)":"var(--color-text-secondary)"}}>{d}<br/>{DW[gd(yr,mo,d)]}</th>;})}</tr></thead>
              <tbody>{act.map(emp=><tr key={emp.id}><td style={{padding:"5px 8px",border:"0.5px solid var(--color-border-tertiary)",whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--color-background-primary)",zIndex:1}}><span style={tg(emp.type==="正"?"#E6F1FB":AL,emp.type==="正"?"#0C447C":AD)}>{emp.type}</span> {emp.name}</td>{Array.from({length:D}).map((_,i)=>{const d=i+1,isR=rests[emp.id+"-"+d],isH=hols.includes(d);return<td key={d} style={{padding:1,textAlign:"center",border:"0.5px solid var(--color-border-tertiary)",minWidth:22,background:isR?"#FCEBEB":isH?"var(--color-background-secondary)":"transparent"}}>{isH?<span style={{fontSize:8,color:"var(--color-text-tertiary)"}}>休</span>:isR?<span style={{fontSize:9,color:"#A32D2D"}}>✓</span>:<span style={{color:"var(--color-text-tertiary)",fontSize:8}}>—</span>}</td>;})}</tr>)}</tbody></table></div>
          </div>}

          {/* STAFF MGR */}
          {pg==="staffmgr"&&isMgr&&<div><div style={cd}><div style={{display:"flex",alignItems:"center",marginBottom:12}}><span style={{fontSize:13,fontWeight:500,flex:1}}>在職 ({act.length})</span><button onClick={()=>setShowAdd(!showAdd)} style={bt(true)}><i className="ti ti-plus"/> 新增</button></div>
            {showAdd&&<div style={{padding:12,background:"var(--color-background-secondary)",borderRadius:8,marginBottom:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:8,marginBottom:8}}><div><div style={lb}>姓名</div><input value={nName} onChange={e=>setNName(e.target.value)} placeholder="姓名" style={ip}/></div><div><div style={lb}>類型</div><select value={nType} onChange={e=>setNType(e.target.value)} style={ip}><option value="正">正</option><option value="PT">PT</option></select></div><div><div style={lb}>時薪</div><input type="number" value={nRate} onChange={e=>setNRate(e.target.value)} disabled={nType==="正"} style={{...ip,opacity:nType==="正"?.4:1}}/></div><div><div style={lb}>年假</div><input type="number" value={nAL} onChange={e=>setNAL(e.target.value)} disabled={nType==="PT"} style={{...ip,opacity:nType==="PT"?.4:1}}/></div></div><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}><button onClick={()=>setShowAdd(false)} style={bt()}>取消</button><button onClick={doAddStaff} style={bt(true)}>確定</button></div></div>}
            {act.map(emp=>renderStaff(emp))}
          </div>
          {inact.length>0&&<div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:8,color:"var(--color-text-secondary)"}}>已離職</div>{inact.map(e=><div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",opacity:.6,marginBottom:4,fontSize:12}}>{e.name}({e.type})<button onClick={()=>updS(e.id,{active:true})} style={{...bt(),marginLeft:"auto",fontSize:10}}>啟用</button></div>)}</div>}
          </div>}

          {/* PERMS */}
          {pg==="perms"&&isMgr&&<div><div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:14}}>員工權限與密碼</div>{act.map(emp=><div key={emp.id} style={{padding:"10px 12px",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:12,fontWeight:500,flex:1}}>{emp.name}</span>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:"var(--color-text-secondary)"}}><input type="checkbox" checked={emp.canView} onChange={e=>updS(emp.id,{canView:e.target.checked})}/> 檢閱</label>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:"var(--color-text-secondary)"}}><input type="checkbox" checked={emp.canEdit} onChange={e=>updS(emp.id,{canEdit:e.target.checked})}/> 編輯</label>
              <button onClick={()=>{setPwId(pwId===emp.id?null:emp.id);setPwV("");}} style={{...bt(),fontSize:10,padding:"3px 8px"}}><i className="ti ti-key" style={{fontSize:12}}/> {pwId===emp.id?"收起":"改密碼"}</button></div>
            {pwId===emp.id&&<div style={{display:"flex",gap:6,alignItems:"end",marginTop:8}}><div style={{flex:1}}><div style={lb}>新密碼</div><input type="text" value={pwV} onChange={e=>setPwV(e.target.value)} placeholder="新密碼" style={ip}/></div><button onClick={()=>{if(pwV){updS(emp.id,{pw:pwV});setPwId(null);setPwV("");}}} style={bt(true)}>儲存</button><button onClick={()=>setPwId(null)} style={bt()}>取消</button></div>}
          </div>)}</div>
          <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:8}}>管理者密碼</div><div style={{display:"flex",gap:8,alignItems:"end"}}><div style={{flex:1}}><div style={lb}>新密碼</div><input type="text" value={mPw} onChange={e=>setMPw(e.target.value)} placeholder="新密碼" style={ip}/></div><button onClick={()=>{if(mPw){saveCfg({...cfg,mgrPassword:mPw});setMPw("");}}} style={bt(true)}>儲存</button></div></div>
          </div>}

          {/* LEAVE MGR */}
          {pg==="leavemgr"&&isMgr&&<div>
            {pendL.length>0&&<div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>待審 ({pendL.length})</div>{pendL.map(r=>{const emp=staff.find(s=>s.id===r.staffId);return<div key={r.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:8,marginBottom:6}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:500}}>{emp?.name} — {r.date}</div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{r.reason}</div></div><button onClick={()=>doLeaveAct(r.id,"approved")} style={{...bt(),background:"#EAF3DE",color:"#27500A",borderColor:"#97C459",fontSize:11,padding:"3px 10px"}}>批准</button><button onClick={()=>doLeaveAct(r.id,"rejected")} style={{...bt(),background:"#FCEBEB",color:"#791F1F",borderColor:"#F09595",fontSize:11,padding:"3px 10px"}}>拒絕</button></div>;})}</div>}
            <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>全部紀錄</div>{leaves.length===0?<div style={{fontSize:12,color:"var(--color-text-tertiary)",textAlign:"center",padding:16}}>無</div>:leaves.map(r=>{const emp=staff.find(s=>s.id===r.staffId);const sm={pending:["待審","#FAEEDA","#633806"],approved:["批准","#EAF3DE","#27500A"],rejected:["拒絕","#FCEBEB","#791F1F"],cancelled:["取消","var(--color-background-secondary)","var(--color-text-tertiary)"]};const[l,bg,c]=sm[r.status]||sm.pending;return<div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12}}><span style={{fontWeight:500,minWidth:50}}>{emp?.name}</span><span style={{color:"var(--color-text-secondary)",flex:1}}>{r.date}—{r.reason}</span><span style={tg(bg,c)}>{l}</span></div>;})}</div>
          </div>}

          {/* BUDGET */}
          {pg==="budget"&&isMgr&&<div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>預算</div><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:14,fontWeight:500}}>$</span><input type="number" value={cfg.ptBudget} onChange={e=>saveCfg({...cfg,ptBudget:parseInt(e.target.value)||0})} style={{fontSize:18,fontWeight:500,border:"none",background:"transparent",width:80,color:"var(--color-text-primary)"}}/></div></div>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>使用</div><div style={{fontSize:20,fontWeight:500,color:ptTot>cfg.ptBudget?"#A32D2D":"#0F6E56"}}>{fm(ptTot)}</div></div>
              <div style={mc}><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>剩餘</div><div style={{fontSize:20,fontWeight:500,color:cfg.ptBudget-ptTot<0?"#A32D2D":"#0F6E56"}}>{fm(cfg.ptBudget-ptTot)}</div></div>
            </div>
            <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>PT 明細</div>{ptC.map(p=><div key={p.id} style={{padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:8,marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{fontWeight:500}}>{p.name}</span><span style={{fontWeight:500,color:A}}>{fm(p.cost)}</span></div><div style={{fontSize:11,color:"var(--color-text-secondary)",display:"flex",gap:12}}><span>${p.rate}/h</span><span>一般{p.h}h</span><span>大夜{p.nh}h</span></div></div>)}</div>
          </div>}

          {/* GAP */}
          {pg==="gap"&&<div>{gaps.length===0?<div style={{...cd,textAlign:"center",padding:30}}><i className="ti ti-check" style={{fontSize:28,color:"#1D9E75"}}/><div style={{fontSize:13,fontWeight:500,color:"#0F6E56",marginTop:6}}>{Object.keys(sch).length===0?"尚未排班":"充足"}</div></div>:<div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>缺口 {gaps.length}</div>{gaps.map((g,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,marginBottom:4,background:g.lv==="danger"?"#FCEBEB":"#FAEEDA"}}><i className="ti ti-alert-triangle" style={{fontSize:13,color:g.lv==="danger"?"#A32D2D":"#BA7517"}}/><span style={{fontSize:12,fontWeight:500,color:g.lv==="danger"?"#791F1F":"#633806"}}>{mo+1}/{g.d}({DW[gd(yr,mo,g.d)]})</span><span style={{fontSize:11,color:g.lv==="danger"?"#791F1F":"#633806"}}>{g.sh.label}</span><span style={{fontSize:11,marginLeft:"auto",fontWeight:500}}>{g.have}/{g.need}</span></div>)}</div>}</div>}

          {/* SETUP */}
          {pg==="setup"&&isMgr&&<div>
            <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:12}}>基本設定</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><div style={lb}>店名</div><input value={cfg.shopName} onChange={e=>saveCfg({...cfg,shopName:e.target.value})} style={ip}/></div><div><div style={lb}>截止日</div><input type="number" min={1} max={28} value={cfg.deadlineDay} onChange={e=>saveCfg({...cfg,deadlineDay:parseInt(e.target.value)||5})} style={ip}/></div></div></div>
            <div style={cd}><div style={{display:"flex",alignItems:"center",marginBottom:12}}><span style={{fontSize:13,fontWeight:500,flex:1}}>班次</span><button onClick={()=>{const id="sh"+Date.now();saveCfg({...cfg,shifts:[...cfg.shifts,{id,label:"新班次",start:"18:00",end:"02:00",hours:8,dow:[1,2,3,4,5],bg:AL,fg:AD,bd:"#AFA9EC",nightX:0}],needs:{...cfg.needs,[id]:[1,2]}});}} style={bt(true)}><i className="ti ti-plus"/> 新增</button></div>
              {cfg.shifts.map(sh=><div key={sh.id} style={{padding:12,border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,marginBottom:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 60px",gap:8,marginBottom:8}}>
                  <div><div style={lb}>名稱</div><input value={sh.label} onChange={e=>{const v=e.target.value;saveCfg({...cfg,shifts:cfg.shifts.map(s=>s.id===sh.id?{...s,label:v}:s)});}} style={ip}/></div>
                  <div><div style={lb}>開始</div><input value={sh.start} onChange={e=>{const v=e.target.value;saveCfg({...cfg,shifts:cfg.shifts.map(s=>s.id===sh.id?{...s,start:v}:s)});}} style={ip}/></div>
                  <div><div style={lb}>結束</div><input value={sh.end} onChange={e=>{const v=e.target.value;saveCfg({...cfg,shifts:cfg.shifts.map(s=>s.id===sh.id?{...s,end:v}:s)});}} style={ip}/></div>
                  <div><div style={lb}>時數</div><input type="number" value={sh.hours} onChange={e=>{const v=parseInt(e.target.value)||0;saveCfg({...cfg,shifts:cfg.shifts.map(s=>s.id===sh.id?{...s,hours:v}:s)});}} style={ip}/></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}><span style={{fontSize:11,color:"var(--color-text-secondary)"}}>星期</span>{DW.map((d,i)=><label key={i} style={{display:"flex",alignItems:"center",gap:2,fontSize:11,cursor:"pointer",color:sh.dow.includes(i)?A:"var(--color-text-tertiary)"}}><input type="checkbox" checked={sh.dow.includes(i)} onChange={()=>saveCfg({...cfg,shifts:cfg.shifts.map(s=>s.id===sh.id?{...s,dow:s.dow.includes(i)?s.dow.filter(x=>x!==i):[...s.dow,i]}:s)})} style={{width:14,height:14}}/>{d}</label>)}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:"var(--color-text-secondary)"}}>需求</span><span style={{fontSize:10}}>低</span><input type="number" min={0} max={20} value={(cfg.needs[sh.id]||[1,2])[0]} onChange={e=>{const v=parseInt(e.target.value)||0;const c=[...(cfg.needs[sh.id]||[1,2])];c[0]=v;saveCfg({...cfg,needs:{...cfg.needs,[sh.id]:c}});}} style={{...ip,width:50,padding:"4px 6px"}}/><span style={{fontSize:10}}>高</span><input type="number" min={0} max={20} value={(cfg.needs[sh.id]||[1,2])[1]} onChange={e=>{const v=parseInt(e.target.value)||0;const c=[...(cfg.needs[sh.id]||[1,2])];c[1]=v;saveCfg({...cfg,needs:{...cfg.needs,[sh.id]:c}});}} style={{...ip,width:50,padding:"4px 6px"}}/>
                  <button onClick={()=>{const n={...cfg.needs};delete n[sh.id];saveCfg({...cfg,shifts:cfg.shifts.filter(s=>s.id!==sh.id),needs:n});}} style={{...bt(),color:"#A32D2D",marginLeft:"auto",fontSize:11,padding:"4px 10px"}}><i className="ti ti-trash" style={{fontSize:13}}/> 刪除</button></div>
              </div>)}
            </div>
          </div>}

          {/* EMP: MY SHIFT */}
          {pg==="myshift"&&!isMgr&&<div>
            {pubInfo&&<div style={al("info")}><i className="ti ti-bell"/> {mo+1}月已發布 — 截止 {cfg.deadlineDay} 號</div>}
            <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>{me?.name} 的 {mo+1}月</div>
              {me?.type==="正"&&<div style={{background:"#E6F1FB",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#0C447C",display:"flex",alignItems:"center",gap:6}}><i className="ti ti-calendar" style={{fontSize:13}}/> 年假 {(me.alTotal||0)-(me.alUsed||0)}/{me.alTotal||0}</div>}
              {(()=>{const my=[];for(let d=1;d<=D;d++)(sch[d]||[]).forEach(a=>{if(a.id===role)my.push({d,shift:a.shift});});
                if(!my.length)return<div style={{textAlign:"center",padding:20,color:"var(--color-text-tertiary)",fontSize:12}}>尚無排班</div>;
                const tH=my.reduce((s,m)=>{const sh=cfg.shifts.find(x=>x.id===m.shift);return s+(sh?.hours||0);},0);
                return<><div style={{display:"flex",flexDirection:"column",gap:5}}>{my.map((m,i)=>{const sh=cfg.shifts.find(x=>x.id===m.shift)||cfg.shifts[0];return<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:sh.bg,borderRadius:8}}><div style={{minWidth:48,textAlign:"center"}}><div style={{fontSize:10,color:sh.fg}}>{DW[gd(yr,mo,m.d)]}</div><div style={{fontSize:16,fontWeight:500,color:sh.fg}}>{mo+1}/{m.d}</div></div><div style={{width:1,height:30,background:sh.bd}}/><div><div style={{fontSize:12,fontWeight:500,color:sh.fg}}>{sh.label}</div><div style={{fontSize:11,color:sh.fg,opacity:.8}}>{sh.start}–{sh.end}·{sh.hours}h</div></div></div>;})}</div><div style={{marginTop:10,paddingTop:10,borderTop:"0.5px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"var(--color-text-secondary)"}}>合計</span><span style={{fontWeight:500,color:"#0F6E56"}}>{my.length}班·{tH}h</span></div></>;
              })()}</div>
          </div>}

          {/* EMP: SUBMIT REST DAYS */}
          {pg==="submit"&&!isMgr&&<div>
            {pubInfo&&<div style={al("info")}><i className="ti ti-bell"/> 公休日：{hols.length>0?hols.sort((a,b)=>a-b).join("、")+"號":"無"}</div>}
            <div style={al("ok")}><i className="ti ti-info-circle"/> 選擇想休息的日子，其餘視為可上班。截止：{mo+1}/{cfg.deadlineDay}</div>
            <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:4}}>選擇休息日</div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:10}}>點選 = 休息（紅色）</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,fontSize:10,textAlign:"center"}}>
                {DW.map(d=><div key={d} style={{padding:3,fontWeight:500,color:"var(--color-text-tertiary)"}}>{d}</div>)}
                {Array.from({length:f1(yr,mo)}).map((_,i)=><div key={"e"+i}/>)}
                {Array.from({length:D}).map((_,i)=>{const d=i+1,isH=hols.includes(d),isR=rests[role+"-"+d];return<div key={d} onClick={()=>{if(!isH)togRest(role,d);}} style={{height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,cursor:isH?"not-allowed":"pointer",fontSize:12,border:`0.5px solid ${isH?"var(--color-border-tertiary)":isR?"#E24B4A":"var(--color-border-tertiary)"}`,background:isH?"var(--color-background-secondary)":isR?"#FCEBEB":"transparent",color:isH?"var(--color-text-tertiary)":isR?"#A32D2D":"var(--color-text-primary)",fontWeight:isR?600:400}}>{isH?"休":d}</div>;})}
              </div>
              <div style={{marginTop:8,fontSize:11,color:"var(--color-text-secondary)"}}>已選 <strong style={{color:"#A32D2D"}}>{cntRest(role)}</strong> 天休息</div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,alignItems:"center"}}>
              {subOk&&<span style={{fontSize:12,color:"#0F6E56",display:"flex",alignItems:"center",gap:4}}><i className="ti ti-check"/> {subOk}</span>}
              <button onClick={()=>{setSubOk("已送出！");setTimeout(()=>setSubOk(""),3000);}} style={bt(true)}><i className="ti ti-send"/> 送出填報</button>
            </div>
          </div>}

          {/* EMP: LEAVE */}
          {pg==="myleave"&&!isMgr&&<div>
            <div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:12}}>休假申請</div>
              {me?.type==="正"&&<div style={{background:"#E6F1FB",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#0C447C"}}>年假 {(me.alTotal||0)-(me.alUsed||0)}/{me.alTotal||0}</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}><div><div style={lb}>開始</div><input type="date" value={lvS} onChange={e=>setLvS(e.target.value)} style={ip}/></div><div><div style={lb}>結束（單日留空）</div><input type="date" value={lvE} onChange={e=>setLvE(e.target.value)} style={ip}/></div></div>
              <div style={{marginBottom:10}}><div style={lb}>原因</div><textarea value={lvR} onChange={e=>setLvR(e.target.value)} rows={2} placeholder="原因..." style={{...ip,resize:"vertical"}}/></div>
              <button onClick={doSubLeave} style={bt(true)}><i className="ti ti-send"/> 提交</button>
            </div>
            {leaves.filter(r=>r.staffId===role).length>0&&<div style={cd}><div style={{fontSize:13,fontWeight:500,marginBottom:10}}>我的紀錄</div>{leaves.filter(r=>r.staffId===role).map(r=>{const sm={pending:["待審","#FAEEDA","#633806"],approved:["批准","#EAF3DE","#27500A"],rejected:["拒絕","#FCEBEB","#791F1F"],cancelled:["取消","var(--color-background-secondary)","var(--color-text-tertiary)"]};const[l,bg,c]=sm[r.status]||sm.pending;return<div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12}}><span style={{fontWeight:500}}>{r.date}</span><span style={{color:"var(--color-text-secondary)",flex:1}}>{r.reason}</span><span style={tg(bg,c)}>{l}</span>{r.status==="pending"&&<button onClick={()=>doLeaveAct(r.id,"cancelled")} style={{...bt(),fontSize:10,padding:"2px 8px",color:"#A32D2D"}}>取消</button>}</div>;})}</div>}
          </div>}

        </div>
      </div>
    </div>
  );
}
