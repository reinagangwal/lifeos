import { useState, useEffect, useCallback } from "react";

const API = "http://127.0.0.1:5000/api";

const C = {
  cream:"#F5F0E8",sand:"#EDE8DC",cardBg:"#FAFAF7",
  orange:"#E8611A",orangeLight:"#F5A66B",
  brown:"#3D2314",brownMid:"#7A4A2E",textMuted:"#9A8F80",
  green:"#7B9E3E",pink:"#C97BAA",gold:"#C97B2A",danger:"#C0392B",
  chartCols:["#3D2314","#8B4A25","#7B9E3E","#C97BAA"],
};
const ICONS  = ["💧","🧘","🤸","👟","📚","🥗","🏋️","😴","🎨","🎵","🧹","🌿"];
const COLORS = [C.orangeLight,C.green,"#A78BD4",C.pink,C.gold,"#5BA4CF"];
const iconFor  = (id) => ICONS[id  % ICONS.length];
const colorFor = (id) => COLORS[id % COLORS.length];

const today    = new Date();
const todayStr = today.toISOString().slice(0,10);
const todayDow = today.getDay()===0 ? 6 : today.getDay()-1;
const WEEK_DAYS= ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const weekDates= Array.from({length:7},(_,i)=>{
  const d=new Date(today); d.setDate(today.getDate()-todayDow+i); return d.getDate();
});

// ── API ──────────────────────────────────────────────────────────────────────
async function api(path,{method="GET",body,token}={}) {
  const h={"Content-Type":"application/json"};
  if(token) h["Authorization"]=`Bearer ${token}`;
  const r=await fetch(`${API}${path}`,{method,headers:h,body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
const TS={get:()=>sessionStorage.getItem("lifeos_tk"),set:(t)=>sessionStorage.setItem("lifeos_tk",t),clear:()=>sessionStorage.removeItem("lifeos_tk")};

// ── Atoms ────────────────────────────────────────────────────────────────────
const Card=({children,style,onClick})=>(
  <div onClick={onClick} style={{background:C.cardBg,borderRadius:24,padding:20,boxShadow:"0 2px 16px rgba(61,35,20,.07)",cursor:onClick?"pointer":undefined,...style}}>{children}</div>
);
const BigBtn=({children,onClick,loading,style,danger})=>(
  <button onClick={onClick} disabled={loading} style={{width:"100%",padding:"16px 0",background:loading?C.textMuted:danger?C.danger:C.orange,color:"#FFF",border:"none",borderRadius:50,fontFamily:"inherit",fontSize:15,fontWeight:700,cursor:loading?"default":"pointer",letterSpacing:".3px",transition:"background .15s",...style}}>
    {loading?"Please wait…":children}
  </button>
);
const Err=({msg})=>msg?<div style={{background:"#FDECEA",border:"1px solid #F5C6C6",borderRadius:12,padding:"12px 16px",color:C.danger,fontSize:13,marginBottom:16}}>{msg}</div>:null;
const Spin=()=><div style={{textAlign:"center",padding:"60px 0",color:C.textMuted,fontSize:13}}>Loading…</div>;

const CheckCircle=({done,onToggle})=>(
  <div onClick={onToggle} style={{width:28,height:28,borderRadius:"50%",flexShrink:0,cursor:"pointer",background:done?C.orange:"transparent",border:`2px solid ${done?C.orange:"#CCC8BE"}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>
    {done&&<svg width="14" height="14" viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" fill="none" stroke="#FFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
  </div>
);
const IconBadge=({icon,color})=>(
  <div style={{width:40,height:40,borderRadius:14,background:color+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
);
const Toggle=({on,onToggle})=>(
  <div onClick={onToggle} style={{width:44,height:24,borderRadius:50,cursor:"pointer",background:on?C.orange:"#DDD",display:"flex",alignItems:"center",padding:"0 3px",transition:"background .2s",flexShrink:0}}>
    <div style={{width:18,height:18,borderRadius:"50%",background:"#FFF",transform:on?"translateX(20px)":"translateX(0)",transition:"transform .2s"}}/>
  </div>
);
const SegControl=({options,value,onChange})=>(
  <div style={{display:"flex",background:C.sand,borderRadius:50,padding:4}}>
    {options.map(([v,label])=>(
      <button key={v} onClick={()=>onChange(v)} style={{flex:1,padding:"10px 0",borderRadius:50,border:"none",background:value===v?C.brown:"transparent",color:value===v?"#FFF":C.textMuted,fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>{label}</button>
    ))}
  </div>
);

function PillChart({data}) {
  return (
    <div style={{display:"flex",gap:14,alignItems:"flex-end",height:200}}>
      {data.map((d,i)=>{
        const fill=Math.max(24,(d.completion_pct/100)*170);
        return (
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,gap:8}}>
            <div style={{position:"relative",width:"100%",height:170,display:"flex",alignItems:"flex-end"}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:170,background:"#EDE8DC",borderRadius:50,opacity:.65,backgroundImage:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(61,35,20,.06) 4px,rgba(61,35,20,.06) 5px)"}}/>
              <div style={{position:"relative",width:"100%",height:fill,background:d.color,borderRadius:50,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:8,transition:"height .6s cubic-bezier(.4,2,.4,1)"}}>
                <span style={{color:"#FFF",fontSize:11,fontWeight:700}}>{d.completion_pct}%</span>
              </div>
            </div>
            <span style={{fontSize:10,color:C.textMuted,textAlign:"center",lineHeight:1.2}}>{d.habit_name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
function AuthScreen({onAuth}) {
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const inp={width:"100%",padding:"14px 16px",borderRadius:16,border:"none",background:C.sand,fontSize:14,fontFamily:"inherit",color:C.brown,outline:"none",boxSizing:"border-box",marginBottom:12};
  const submit=async()=>{
    setError("");setLoading(true);
    try{
      const d=await api(mode==="/login"?"/auth/login":"/auth/register",{method:"POST",body:mode==="login"?{email,password:pass}:{name,email,password:pass}});
      TS.set(d.token);onAuth(d.token);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };
  return (
    <div style={{minHeight:"100vh",background:C.cream,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px",fontFamily:"'Nunito',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:390}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:56,marginBottom:8}}>🌱</div>
          <h1 style={{margin:0,fontSize:32,fontWeight:900,color:C.brown,letterSpacing:"-.5px"}}>LifeOS</h1>
          <p style={{margin:"6px 0 0",fontSize:14,color:C.textMuted}}>Build better days, one habit at a time</p>
        </div>
        <SegControl options={[["login","Sign In"],["register","Create Account"]]} value={mode} onChange={(m)=>{setMode(m);setError("");}}/>
        <div style={{marginTop:20}}>
          <Err msg={error}/>
          {mode==="register"&&<input placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} style={inp}/>}
          <input placeholder="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
          <input placeholder="Password" type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} style={{...inp,marginBottom:24}}/>
          <BigBtn onClick={submit} loading={loading}>{mode==="login"?"Sign In →":"Create Account →"}</BigBtn>
        </div>
      </div>
    </div>
  );
}

// ── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({token,user,habits,setHabits,loadHabits,setScreen}) {
  const [selDay,setSelDay]=useState(todayDow);
  const [toggling,setToggling]=useState(null);
  const done=habits.filter(h=>h.done).length;

  const toggle=async(h)=>{
    if(toggling) return;
    setToggling(h.habit_id);
    const newDone=!h.done;
    setHabits(p=>p.map(x=>x.habit_id===h.habit_id?{...x,done:newDone}:x));
    try{
      await api(`/habits/${h.habit_id}/log`,{method:"POST",token,body:{log_date:todayStr,status:newDone?1:0}});
      await loadHabits();
    }catch{
      setHabits(p=>p.map(x=>x.habit_id===h.habit_id?{...x,done:!newDone}:x));
    }finally{setToggling(null);}
  };

  return (
    <div style={{padding:"0 0 100px"}}>
      <div style={{padding:"52px 24px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <p style={{margin:0,fontSize:13,color:C.textMuted,fontWeight:500}}>{today.toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
          <h1 style={{margin:"4px 0 0",fontSize:30,fontWeight:900,color:C.brown,letterSpacing:"-.5px"}}>Morning, {user?.name?.split(" ")[0]||"there"}</h1>
        </div>
        <div style={{width:44,height:44,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🐯</div>
      </div>

      {/* Week strip */}
      <div style={{padding:"0 20px 8px",display:"flex",gap:4}}>
        {WEEK_DAYS.map((d,i)=>(
          <div key={i} onClick={()=>setSelDay(i)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"10px 0",borderRadius:16,cursor:"pointer",background:selDay===i?C.brown:"transparent",transition:"all .2s"}}>
            <span style={{fontSize:9,color:selDay===i?"#FFF":C.textMuted,fontWeight:600,textTransform:"uppercase"}}>{d}</span>
            <span style={{fontSize:15,fontWeight:700,color:selDay===i?"#FFF":C.brown}}>{weekDates[i]}</span>
          </div>
        ))}
      </div>

      {/* Points banner */}
      <div style={{margin:"8px 20px 0"}}>
        <div style={{background:"#FAE8D5",borderRadius:22,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <p style={{margin:0,fontSize:13,color:C.brownMid,fontWeight:600}}>🏆 Total Points</p>
            <p style={{margin:"4px 0 0",fontSize:28,fontWeight:900,color:C.brown}}>{user?.points??0}</p>
          </div>
          <button onClick={()=>setScreen("progress")} style={{background:C.brown,color:"#FFF",border:"none",borderRadius:50,padding:"10px 20px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>View Progress</button>
        </div>
      </div>

      {/* Habits */}
      <div style={{padding:"24px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,color:C.brown}}>Daily routine</h2>
          <button onClick={()=>setScreen("habits")} style={{background:"none",border:"none",fontSize:13,color:C.orange,fontFamily:"inherit",cursor:"pointer",fontWeight:600}}>See all</button>
        </div>
        {habits.length===0?(
          <div style={{textAlign:"center",padding:"40px 0",color:C.textMuted}}>
            <p style={{fontSize:32,margin:"0 0 8px"}}>🌱</p>
            <p style={{margin:0,fontSize:14}}>No habits yet. Tap + to add one!</p>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8,position:"relative"}}>
            <div style={{position:"absolute",left:33,top:28,bottom:28,width:1,borderLeft:"2px dashed #DDD8CE"}}/>
            {habits.map(h=>(
              <div key={h.habit_id} style={{display:"flex",alignItems:"center",gap:12,background:C.cardBg,borderRadius:18,padding:"14px 16px",boxShadow:"0 1px 8px rgba(61,35,20,.05)",position:"relative",borderLeft:`3px solid ${h.done?C.orange:"transparent"}`,transition:"all .2s",opacity:toggling===h.habit_id?.6:1}}>
                <CheckCircle done={h.done} onToggle={()=>toggle(h)}/>
                <IconBadge icon={h.icon} color={h.color}/>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:0,fontSize:14,fontWeight:700,color:C.brown,opacity:h.done?.5:1,textDecoration:h.done?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.habit_name}</p>
                  <p style={{margin:"2px 0 0",fontSize:11,color:C.textMuted}}>🔥 Streak {h.current_streak} day{h.current_streak!==1?"s":""}</p>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:h.done?C.orange:C.textMuted,background:h.done?C.orange+"18":C.sand,borderRadius:50,padding:"3px 10px",flexShrink:0}}>{h.frequency}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress ring */}
      {habits.length>0&&(
        <div style={{margin:"24px 20px 0"}}>
          <Card style={{background:C.brown}} onClick={()=>setScreen("progress")}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.6)",fontWeight:500}}>Today's progress</p>
                <p style={{margin:"4px 0 0",fontSize:28,fontWeight:900,color:"#FFF"}}>{done}/{habits.length} done</p>
              </div>
              <div style={{width:56,height:56,borderRadius:"50%",background:`conic-gradient(${C.orange} ${done/habits.length*360}deg,rgba(255,255,255,.15) 0)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:C.brown,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{color:"#FFF",fontSize:11,fontWeight:700}}>{Math.round(done/habits.length*100)}%</span>
                </div>
              </div>
            </div>
            <div style={{marginTop:16,height:4,borderRadius:4,background:"rgba(255,255,255,.15)"}}>
              <div style={{height:"100%",borderRadius:4,background:C.orange,width:`${done/habits.length*100}%`,transition:"width .5s"}}/>
            </div>
          </Card>
        </div>
      )}

      <button onClick={()=>setScreen("new-habit")} style={{position:"fixed",bottom:90,right:24,width:56,height:56,borderRadius:"50%",background:C.brown,border:"none",boxShadow:"0 4px 20px rgba(61,35,20,.35)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
        <span style={{color:"#FFF",fontSize:26,lineHeight:1}}>+</span>
      </button>
    </div>
  );
}

// ── PROGRESS ─────────────────────────────────────────────────────────────────
function ProgressScreen({token,setScreen}) {
  const [summary,setSummary]=useState(null);
  const [weekly,setWeekly]=useState([]);
  const [badges,setBadges]=useState([]);
  const [monthly,setMonthly]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const BEMOJI={streak_7:"🏅",streak_30:"🥈",streak_100:"🥇",total_10:"🌿",total_50:"⚡",total_100:"💎",points_100:"⭐",points_500:"🌟",points_1000:"🏆"};

  useEffect(()=>{
    const isoWeek=Math.ceil((((today-new Date(today.getFullYear(),0,1))/86400000)+new Date(today.getFullYear(),0,1).getDay()+1)/7);
    Promise.all([
      api("/dashboard/summary",{token}),
      api(`/dashboard/weekly?year=${today.getFullYear()}&week=${isoWeek}`,{token}),
      api("/dashboard/badges",{token}),
      api(`/dashboard/monthly?month=${todayStr.slice(0,7)}`,{token}),
    ]).then(([s,w,b,m])=>{
      setSummary(s);
      setWeekly((w.habits||[]).slice(0,4).map((h,i)=>({habit_name:h.habit_name,completion_pct:Math.round(h.completion_pct||0),color:C.chartCols[i%4]})));
      setBadges(b||[]);setMonthly(m);
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[token]);

  if(loading) return <div style={{padding:"52px 24px"}}><Spin/></div>;

  return (
    <div style={{padding:"52px 24px 100px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <h1 style={{margin:0,fontSize:28,fontWeight:900,color:C.brown,lineHeight:1.15}}>Your progress<br/>and insights</h1>
        <button onClick={()=>setScreen("home")} style={{width:40,height:40,borderRadius:"50%",background:C.sand,border:"none",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>
      <Err msg={error}/>
      {weekly.length>0?<PillChart data={weekly}/>:<div style={{textAlign:"center",padding:"40px 0",color:C.textMuted,fontSize:13}}>Log some habits to see weekly charts!</div>}

      <Card style={{marginTop:28}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <p style={{margin:0,fontSize:13,color:C.textMuted,fontWeight:500}}>Points Earned</p>
            <p style={{margin:"2px 0 0",fontSize:12,color:C.textMuted}}>Lifetime total</p>
          </div>
          <p style={{margin:0,fontSize:22,fontWeight:900,color:C.orange}}>{summary?.points??0} <span style={{fontSize:14,fontWeight:500}}>pts</span></p>
        </div>
        <div style={{display:"flex"}}>
          {[["Active habits",summary?.active_habits??0],["Best streak",`${summary?.best_current_streak??0}d`],["Done today",summary?.completed_today??0]].map(([l,v],i,a)=>(
            <div key={i} style={{flex:1,textAlign:"center",borderRight:i<a.length-1?`1px solid ${C.sand}`:"none",padding:"8px 0"}}>
              <p style={{margin:0,fontSize:10,color:C.textMuted}}>{l}</p>
              <p style={{margin:"4px 0 0",fontSize:17,fontWeight:800,color:C.brown}}>{v}</p>
            </div>
          ))}
        </div>
      </Card>

      {monthly&&(
        <Card style={{marginTop:16}}>
          <p style={{margin:"0 0 12px",fontSize:14,fontWeight:800,color:C.brown}}>📅 {todayStr.slice(0,7)}</p>
          <div style={{display:"flex"}}>
            {[["Completions",monthly.total_completions??0],["Active",monthly.active_habits??0],["Rate",`${monthly.overall_completion_pct??0}%`]].map(([l,v],i,a)=>(
              <div key={i} style={{flex:1,textAlign:"center",borderRight:i<a.length-1?`1px solid ${C.sand}`:"none",padding:"8px 0"}}>
                <p style={{margin:0,fontSize:10,color:C.textMuted}}>{l}</p>
                <p style={{margin:"4px 0 0",fontSize:17,fontWeight:800,color:C.brown}}>{v}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <h2 style={{margin:"28px 0 14px",fontSize:18,fontWeight:800,color:C.brown}}>My badges</h2>
      {badges.length===0?(
        <div style={{textAlign:"center",padding:"32px 0",color:C.textMuted,fontSize:13}}>Keep logging to earn badges! 🏅</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {badges.map((b,i)=>(
            <Card key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px"}}>
              <div style={{width:44,height:44,borderRadius:14,background:C.orange+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{BEMOJI[b.criteria]||"🎖️"}</div>
              <div>
                <p style={{margin:0,fontSize:14,fontWeight:700,color:C.brown}}>{b.badge_name}</p>
                <p style={{margin:"2px 0 0",fontSize:12,color:C.textMuted}}>{b.description}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── HABITS LIST ───────────────────────────────────────────────────────────────
function HabitsScreen({token,habits,loadHabits,setScreen}) {
  const [deleting,setDeleting]=useState(null);
  const [error,setError]=useState("");
  const del=async(id)=>{
    if(!window.confirm("Deactivate this habit?")) return;
    setDeleting(id);
    try{await api(`/habits/${id}`,{method:"DELETE",token});await loadHabits();}
    catch(e){setError(e.message);}finally{setDeleting(null);}
  };
  return (
    <div style={{padding:"52px 24px 100px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <h1 style={{margin:0,fontSize:28,fontWeight:900,color:C.brown}}>My Habits</h1>
        <button onClick={()=>setScreen("new-habit")} style={{background:C.orange,color:"#FFF",border:"none",borderRadius:50,padding:"8px 20px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ New</button>
      </div>
      <Err msg={error}/>
      {habits.length===0?(
        <div style={{textAlign:"center",padding:"60px 0",color:C.textMuted}}>
          <p style={{fontSize:40,margin:"0 0 10px"}}>🌱</p>
          <p style={{fontSize:14}}>Add your first habit to get started!</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {habits.map(h=>(
            <Card key={h.habit_id} style={{display:"flex",gap:14,alignItems:"center"}}>
              <IconBadge icon={h.icon} color={h.color}/>
              <div style={{flex:1,minWidth:0}}>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:C.brown,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.habit_name}</p>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,background:C.sand,color:C.brownMid,borderRadius:50,padding:"2px 10px",fontWeight:700}}>{h.frequency}</span>
                  <span style={{fontSize:10,background:C.sand,color:C.brownMid,borderRadius:50,padding:"2px 10px",fontWeight:700}}>{h.habit_type}</span>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <p style={{margin:0,fontSize:22,fontWeight:900,color:C.orange}}>{h.current_streak}</p>
                <p style={{margin:0,fontSize:9,color:C.textMuted}}>day streak</p>
              </div>
              <button onClick={()=>del(h.habit_id)} disabled={deleting===h.habit_id} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,opacity:.35,padding:"4px",lineHeight:1}}>🗑</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NEW HABIT ─────────────────────────────────────────────────────────────────
function NewHabitScreen({token,loadHabits,setScreen}) {
  const [name,setName]=useState("");
  const [freq,setFreq]=useState("daily");
  const [type,setType]=useState("binary");
  const [target,setTarget]=useState(1);
  const [icon,setIcon]=useState("🧘");
  const [selDays,setSelDays]=useState([todayDow]);
  const [reminder,setReminder]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const DAYS=["M","T","W","T","F","S","S"];
  const toggleDay=i=>setSelDays(p=>p.includes(i)?p.filter(d=>d!==i):[...p,i]);
  const inp={width:"100%",padding:"14px 16px",borderRadius:16,border:"none",background:C.sand,fontSize:14,fontFamily:"inherit",color:C.brown,outline:"none",boxSizing:"border-box"};
  const lbl={fontSize:12,color:C.textMuted,fontWeight:700,display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"};

  const save=async()=>{
    if(!name.trim()){setError("Please enter a habit name");return;}
    setError("");setLoading(true);
    try{
      await api("/habits/",{method:"POST",token,body:{habit_name:name.trim(),frequency:freq,habit_type:type,target_count:target}});
      await loadHabits();setScreen("habits");
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };

  return (
    <div style={{padding:"52px 24px 100px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
        <h1 style={{margin:0,fontSize:28,fontWeight:900,color:C.brown}}>New habit</h1>
        <button onClick={()=>setScreen("home")} style={{width:40,height:40,borderRadius:"50%",background:C.sand,border:"none",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>

      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:64,lineHeight:1,marginBottom:12}}>{icon}</div>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          {ICONS.map((ic,i)=>(
            <button key={i} onClick={()=>setIcon(ic)} style={{width:40,height:40,borderRadius:12,border:"none",background:icon===ic?C.brown:C.sand,fontSize:20,cursor:"pointer",transition:"all .15s"}}>{ic}</button>
          ))}
        </div>
      </div>

      <Err msg={error}/>
      <div style={{marginBottom:16}}><label style={lbl}>Name your habit</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Morning Meditations" style={inp}/></div>
      <div style={{marginBottom:16}}><label style={lbl}>Frequency</label><SegControl options={[["daily","Daily"],["weekly","Weekly"]]} value={freq} onChange={setFreq}/></div>
      <div style={{marginBottom:16}}><label style={lbl}>Habit type</label><SegControl options={[["binary","Done / Not done"],["count","Count-based"]]} value={type} onChange={setType}/></div>

      {type==="count"&&(
        <div style={{marginBottom:16}}>
          <label style={lbl}>Target per period</label>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <button onClick={()=>setTarget(t=>Math.max(1,t-1))} style={{width:40,height:40,borderRadius:"50%",border:"none",background:C.sand,fontSize:20,cursor:"pointer"}}>−</button>
            <span style={{fontSize:28,fontWeight:900,color:C.brown,minWidth:40,textAlign:"center"}}>{target}</span>
            <button onClick={()=>setTarget(t=>t+1)} style={{width:40,height:40,borderRadius:"50%",border:"none",background:C.brown,color:"#FFF",fontSize:20,cursor:"pointer"}}>+</button>
          </div>
        </div>
      )}

      <div style={{marginBottom:16}}>
        <label style={lbl}>Repeat days</label>
        <div style={{display:"flex",gap:8}}>
          {DAYS.map((d,i)=>(
            <button key={i} onClick={()=>toggleDay(i)} style={{flex:1,aspectRatio:"1",borderRadius:"50%",border:"none",background:selDays.includes(i)?C.brown:C.sand,color:selDays.includes(i)?"#FFF":C.textMuted,fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>{d}</button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:32}}>
        <div>
          <p style={{margin:0,fontSize:14,fontWeight:700,color:C.brown}}>Get reminders</p>
          <p style={{margin:0,fontSize:12,color:C.textMuted}}>Daily nudge to stay on track</p>
        </div>
        <Toggle on={reminder} onToggle={()=>setReminder(p=>!p)}/>
      </div>
      <BigBtn onClick={save} loading={loading}>Save Habit</BigBtn>
    </div>
  );
}

// ── EXPENSES ──────────────────────────────────────────────────────────────────
function ExpensesScreen({token}) {
  const [expenses,setExpenses]=useState([]);
  const [budgets,setBudgets]=useState([]);
  const [alerts,setAlerts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [tab,setTab]=useState("log");
  const [month,setMonth]=useState(todayStr.slice(0,7));
  const [cat,setCat]=useState("");
  const [amt,setAmt]=useState("");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const [bCat,setBCat]=useState("");
  const [bLimit,setBLimit]=useState("");
  const [bMonth,setBMonth]=useState(todayStr.slice(0,7));
  const [bSaving,setBSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [e,b,a]=await Promise.all([api(`/expenses/?month=${month}`,{token}),api("/expenses/budgets/",{token}),api("/expenses/alerts/",{token})]);
      setExpenses(e||[]);setBudgets(b||[]);setAlerts(a||[]);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[token,month]);

  useEffect(()=>{load();},[load]);

  const addExpense=async()=>{
    if(!cat.trim()||!amt){setError("Category and amount required");return;}
    setError("");setSaving(true);
    try{
      const r=await api("/expenses/",{method:"POST",token,body:{category:cat.trim(),amount:parseFloat(amt),note:note.trim()||undefined,expense_date:todayStr}});
      if(r.warning) setError("⚠️ "+r.warning);
      setCat("");setAmt("");setNote("");await load();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  };

  const addBudget=async()=>{
    if(!bCat.trim()||!bLimit){setError("Category and limit required");return;}
    setError("");setBSaving(true);
    try{
      await api("/expenses/budgets/",{method:"POST",token,body:{category:bCat.trim(),monthly_limit:parseFloat(bLimit),month_year:bMonth}});
      setBCat("");setBLimit("");await load();
    }catch(e){setError(e.message);}finally{setBSaving(false);}
  };

  const inp={flex:1,padding:"12px 14px",borderRadius:14,border:"none",background:C.sand,fontSize:13,fontFamily:"inherit",color:C.brown,outline:"none"};
  if(loading) return <div style={{padding:"52px 24px"}}><Spin/></div>;

  return (
    <div style={{padding:"52px 24px 100px"}}>
      <h1 style={{margin:"0 0 20px",fontSize:28,fontWeight:900,color:C.brown}}>Expenses</h1>
      <SegControl options={[["log","💸 Log"],["budget","🎯 Budget"],["alerts","⚠️ Alerts"]]} value={tab} onChange={setTab}/>
      <div style={{marginTop:20}}><Err msg={error}/></div>

      {tab==="log"&&(
        <>
          <Card style={{marginBottom:20}}>
            <p style={{margin:"0 0 12px",fontSize:13,fontWeight:800,color:C.brown}}>Add expense</p>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input placeholder="Category" value={cat} onChange={e=>setCat(e.target.value)} style={inp}/>
              <input placeholder="Amount" type="number" value={amt} onChange={e=>setAmt(e.target.value)} style={{...inp,flex:"0 0 100px"}}/>
            </div>
            <input placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} style={{...inp,width:"100%",boxSizing:"border-box",marginBottom:12}}/>
            <BigBtn onClick={addExpense} loading={saving} style={{padding:"12px 0",fontSize:13}}>Add Expense</BigBtn>
          </Card>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontSize:13,fontWeight:700,color:C.brown}}>{month}</span>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{background:C.sand,border:"none",borderRadius:50,padding:"6px 14px",fontFamily:"inherit",fontSize:12,color:C.brown,outline:"none",cursor:"pointer"}}/>
          </div>
          {expenses.length===0?(
            <div style={{textAlign:"center",padding:"40px 0",color:C.textMuted,fontSize:13}}>No expenses for {month}</div>
          ):(
            <>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {expenses.map(e=>(
                  <div key={e.expense_id} style={{display:"flex",alignItems:"center",gap:12,background:C.cardBg,borderRadius:16,padding:"12px 16px",boxShadow:"0 1px 6px rgba(61,35,20,.05)"}}>
                    <div style={{width:36,height:36,borderRadius:12,flexShrink:0,background:C.orange+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💸</div>
                    <div style={{flex:1}}>
                      <p style={{margin:0,fontSize:13,fontWeight:700,color:C.brown}}>{e.category}</p>
                      {e.note&&<p style={{margin:0,fontSize:11,color:C.textMuted}}>{e.note}</p>}
                      <p style={{margin:0,fontSize:10,color:C.textMuted}}>{e.expense_date}</p>
                    </div>
                    <p style={{margin:0,fontSize:16,fontWeight:800,color:C.brown}}>₹{parseFloat(e.amount).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div style={{textAlign:"right",padding:"10px 4px"}}>
                <span style={{fontSize:13,fontWeight:700,color:C.textMuted}}>Total: ₹{expenses.reduce((s,e)=>s+parseFloat(e.amount),0).toFixed(2)}</span>
              </div>
            </>
          )}
        </>
      )}

      {tab==="budget"&&(
        <>
          <Card style={{marginBottom:20}}>
            <p style={{margin:"0 0 12px",fontSize:13,fontWeight:800,color:C.brown}}>Set monthly budget</p>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input placeholder="Category" value={bCat} onChange={e=>setBCat(e.target.value)} style={inp}/>
              <input placeholder="Limit (₹)" type="number" value={bLimit} onChange={e=>setBLimit(e.target.value)} style={{...inp,flex:"0 0 100px"}}/>
            </div>
            <input type="month" value={bMonth} onChange={e=>setBMonth(e.target.value)} style={{...inp,width:"100%",boxSizing:"border-box",marginBottom:12}}/>
            <BigBtn onClick={addBudget} loading={bSaving} style={{padding:"12px 0",fontSize:13}}>Set Budget</BigBtn>
          </Card>
          {budgets.length===0?(
            <div style={{textAlign:"center",padding:"40px 0",color:C.textMuted,fontSize:13}}>No budgets set yet</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {budgets.map(b=>(
                <Card key={b.budget_id} style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <div>
                      <p style={{margin:0,fontSize:14,fontWeight:700,color:C.brown}}>{b.category}</p>
                      <p style={{margin:0,fontSize:11,color:C.textMuted}}>{b.month_year}</p>
                    </div>
                    <p style={{margin:0,fontSize:16,fontWeight:800,color:C.brown}}>₹{parseFloat(b.monthly_limit).toFixed(0)}/mo</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab==="alerts"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {alerts.length===0?(
            <div style={{textAlign:"center",padding:"40px 0",color:C.textMuted,fontSize:13}}>🎉 No alerts — you're within budget!</div>
          ):alerts.map(a=>(
            <div key={a.alert_id} style={{background:"#FDECEA",borderRadius:16,padding:"14px 16px",borderLeft:`4px solid ${C.danger}`}}>
              <p style={{margin:0,fontSize:13,fontWeight:800,color:C.danger}}>⚠️ {a.category} over budget</p>
              <p style={{margin:"4px 0 0",fontSize:12,color:C.brownMid}}>Limit ₹{parseFloat(a.budget_limit).toFixed(0)} · Spent ₹{parseFloat(a.total_spent).toFixed(2)} · Over by ₹{parseFloat(a.overage).toFixed(2)}</p>
              <p style={{margin:"2px 0 0",fontSize:10,color:C.textMuted}}>{a.triggered_at}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NAV ───────────────────────────────────────────────────────────────────────
function BottomNav({screen,setScreen}) {
  const NAV=[{id:"home",icon:"🏠",label:"Home"},{id:"habits",icon:"📋",label:"Habits"},{id:"expenses",icon:"💸",label:"Expenses"},{id:"progress",icon:"📈",label:"Progress"}];
  return (
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.cardBg,borderTop:"1px solid #EDE8DC",display:"flex",padding:"8px 0 18px",zIndex:200}}>
      {NAV.map(n=>{
        const active=screen===n.id||(screen==="new-habit"&&n.id==="habits");
        return (
          <button key={n.id} onClick={()=>setScreen(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
            <div style={{width:40,height:40,borderRadius:14,background:active?C.brown:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,transition:"all .2s"}}>{n.icon}</div>
            <span style={{fontSize:10,color:active?C.brown:C.textMuted,fontWeight:active?700:400}}>{n.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [token,setToken]=useState(()=>TS.get());
  const [screen,setScreen]=useState("home");
  const [user,setUser]=useState(null);
  const [habits,setHabits]=useState([]);

  useEffect(()=>{
    if(!token) return;
    api("/auth/me",{token}).then(setUser).catch(()=>{TS.clear();setToken(null);});
  },[token]);

  const loadHabits=useCallback(async()=>{
    if(!token) return;
    try{
      const raw=await api("/habits/",{token});
      const active=(raw||[]).filter(h=>h.is_active!==0);
      // Check today's log for each habit in parallel
      const todayMap={};
      await Promise.allSettled(active.map(async h=>{
        try{
          const logs=await api(`/habits/${h.habit_id}/logs?limit=1`,{token});
          if(logs?.[0]?.log_date===todayStr&&(logs[0].status===1||logs[0].completion_count>0)) todayMap[h.habit_id]=true;
        }catch{}
      }));
      setHabits(active.map(h=>({...h,icon:iconFor(h.habit_id),color:colorFor(h.habit_id),done:!!todayMap[h.habit_id]})));
      const u=await api("/auth/me",{token});setUser(u);
    }catch{}
  },[token]);

  useEffect(()=>{if(token) loadHabits();},[token,loadHabits]);

  const handleAuth=(t)=>{setToken(t);setScreen("home");};
  const logout=()=>{TS.clear();setToken(null);setUser(null);setHabits([]);setScreen("home");};

  if(!token) return <AuthScreen onAuth={handleAuth}/>;

  const screens={
    home:      <HomeScreen token={token} user={user} habits={habits} setHabits={setHabits} loadHabits={loadHabits} setScreen={setScreen}/>,
    habits:    <HabitsScreen token={token} habits={habits} loadHabits={loadHabits} setScreen={setScreen}/>,
    "new-habit":<NewHabitScreen token={token} loadHabits={loadHabits} setScreen={setScreen}/>,
    progress:  <ProgressScreen token={token} setScreen={setScreen}/>,
    expenses:  <ExpensesScreen token={token}/>,
  };

  return (
    <div style={{minHeight:"100vh",background:C.cream,fontFamily:"'Nunito',system-ui,sans-serif",display:"flex",justifyContent:"center"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:430,position:"relative",minHeight:"100vh"}}>
        <button onClick={logout} style={{position:"fixed",top:16,right:16,zIndex:300,background:C.sand,border:"none",borderRadius:50,padding:"6px 14px",fontSize:11,fontWeight:700,color:C.textMuted,cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
        <div style={{paddingBottom:80}}>{screens[screen]||screens.home}</div>
        <BottomNav screen={screen} setScreen={setScreen}/>
      </div>
    </div>
  );
}
