import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const DEMO_SUBJECTS = [
  {id:"maths",name:"Mathematics",description:"Build concepts, practise problems and strengthen your fundamentals.",icon:"∑",color:"purple",createdAt:Date.now()-30000},
  {id:"ict",name:"Information Technology",description:"Explore computing, theory and practical ICT lessons.",icon:"⌘",color:"mint",createdAt:Date.now()-20000},
  {id:"science",name:"Science",description:"Understand the world through clear explanations and examples.",icon:"⚗",color:"peach",createdAt:Date.now()-10000}
];
const DEMO_LESSONS = [
  {id:"demo-1",title:"Introduction to the subject",subjectId:"maths",youtubeUrl:"https://www.youtube.com/watch?v=jfKfPfyJRdk",description:"A sample recording card. Replace this URL with your own class recording.",duration:"12:40",createdAt:Date.now()-40000},
  {id:"demo-2",title:"Core concepts explained",subjectId:"ict",youtubeUrl:"https://www.youtube.com/watch?v=aqz-KE-bpKQ",description:"See how your recorded lessons will appear in the student library.",duration:"18:20",createdAt:Date.now()-30000},
  {id:"demo-3",title:"Revision and practice",subjectId:"science",youtubeUrl:"https://www.youtube.com/watch?v=ScMzIvxBSi4",description:"Demo content only — add your own YouTube recording in Admin Studio.",duration:"24:05",createdAt:Date.now()-20000}
];
const DEMO_NOTES = [
  {id:"note-1",title:"Mathematics — revision notes",subjectId:"maths",pdfUrl:"https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",description:"Sample PDF link. Replace with your own notes.",createdAt:Date.now()-30000},
  {id:"note-2",title:"ICT — lesson handout",subjectId:"ict",pdfUrl:"https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",description:"A sample handout for preview purposes.",createdAt:Date.now()-20000}
];

let authMode = "signin", currentUser = null, currentRole = "student", currentView = "overview";
let adminTab = "lessons", activeFilter = "all", currentLesson = null, ytPlayer = null;
let watchTimer = null, lastTick = 0, sessionWatched = 0, lastSaveAt = 0, toastTimer = null;
let subjects = [], lessons = [], notes = [], progress = {};
let demoMode = !isFirebaseConfigured, demoUser = null;
let fb = null;

function toast(message, error=false) {
  const el=$("#toast"); el.textContent=message; el.classList.toggle("error",error); el.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3000);
}
function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function safeUrl(value) {
  try { const u=new URL(value); return ["https:","http:"].includes(u.protocol)?u.href:""; } catch { return ""; }
}
function youtubeId(url="") {
  try {
    const u=new URL(url);
    if(u.hostname==="youtu.be") return u.pathname.slice(1).split("/")[0];
    if(u.hostname.endsWith("youtube.com")||u.hostname==="youtube-nocookie.com") {
      if(u.searchParams.get("v")) return u.searchParams.get("v");
      const m=u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/); return m?.[1]||"";
    }
  } catch {}
  return "";
}
function subjectName(id) { return subjects.find(s=>s.id===id)?.name || "Uncategorised"; }
function initials(name="Student") { return name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase()||"S"; }
function timeText(seconds) { const s=Math.max(0,Math.floor(seconds||0)); return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`; }
function lessonWatched(id) { return Number(progress[id]?.seconds||0); }
function lessonDone(id) { return Boolean(progress[id]?.completed); }
function totalWatched() { return Object.values(progress).reduce((n,p)=>n+Number(p.seconds||0),0); }
function completedCount() { return Object.values(progress).filter(p=>p.completed).length; }
function setAuthMode(mode) {
  authMode=mode;
  $$(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.authMode===mode));
  $("#auth-title").textContent=mode==="signin"?"Welcome back":"Create your account";
  $("#auth-subtitle").textContent=mode==="signin"?"Sign in to continue your learning journey.":"Join your class and learn at your own pace.";
  $("#auth-submit").innerHTML=mode==="signin"?'Sign in <span>→</span>':'Create account <span>→</span>';
  $("#name-label").classList.toggle("hidden",mode!=="signup");
  $("#name-wrap").classList.toggle("hidden",mode!=="signup");
  $("#auth-name").required=mode==="signup";
  $("#forgot-password").classList.toggle("hidden",mode!=="signin");
}
function showAuth() { $("#auth-screen").classList.remove("hidden"); $("#app-screen").classList.add("hidden"); }
function showApp() { $("#auth-screen").classList.add("hidden"); $("#app-screen").classList.remove("hidden"); }
function updateIdentity() {
  const name=currentUser?.displayName || currentUser?.name || currentUser?.email?.split("@")[0] || "Student";
  $("#user-name").textContent=name; $("#user-role").textContent=currentRole==="admin"?"Administrator":"Student account";
  $("#user-avatar").textContent=initials(name); $("#top-avatar").textContent=initials(name);
  $("#admin-nav").classList.toggle("hidden",currentRole!=="admin");
  $("#welcome-title").innerHTML=`Welcome back<span class="wave"> ✦</span>`;
  $("#today-date").textContent=new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date());
}
function seedDemo() {
  subjects=structuredClone(DEMO_SUBJECTS); lessons=structuredClone(DEMO_LESSONS); notes=structuredClone(DEMO_NOTES);
}
function enterDemo(role) {
  demoMode=true; demoUser={uid:role==="admin"?"demo-admin":"demo-student",email:role==="admin"?"admin@demo.local":"student@demo.local",displayName:role==="admin"?"Demo Admin":"Demo Student"};
  currentUser=demoUser; currentRole=role; progress=JSON.parse(localStorage.getItem(`classspace-progress-${demoUser.uid}`)||"{}");
  seedDemo(); updateIdentity(); showApp(); renderAll(); toast(`Previewing as ${role}. Demo changes stay in this browser.`);
}
async function initFirebase() {
  const [appMod,authMod,storeMod]=await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
  ]);
  const app=appMod.initializeApp(firebaseConfig);
  const auth=authMod.getAuth(app), db=storeMod.getFirestore(app);
  fb={...authMod,...storeMod,auth,db};
  authMod.onAuthStateChanged(auth,async user=>{
    if(!user){currentUser=null;showAuth();return;}
    currentUser=user;
    try {
      const ref=storeMod.doc(db,"users",user.uid), snap=await storeMod.getDoc(ref);
      if(!snap.exists()) {
        await storeMod.setDoc(ref,{uid:user.uid,email:user.email||"",displayName:user.displayName||user.email?.split("@")[0]||"Student",role:"student",createdAt:Date.now()});
        currentRole="student";
      } else currentRole=snap.data().role==="admin"?"admin":"student";
      await loadRemoteData(); progress=await loadProgress();
      updateIdentity();showApp();renderAll();
    } catch(e) { console.error(e); toast("Couldn't load your class data. Check Firestore setup and security rules.",true); }
  });
}
async function loadRemoteData() {
  const [s,l,n]=await Promise.all([
    fb.getDocs(fb.collection(fb.db,"subjects")),
    fb.getDocs(fb.collection(fb.db,"lessons")),
    fb.getDocs(fb.collection(fb.db,"notes"))
  ]);
  subjects=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  lessons=l.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  notes=n.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
async function loadProgress() {
  const snap=await fb.getDocs(fb.collection(fb.db,"users",currentUser.uid,"progress"));
  return Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));
}
async function refreshData() {
  if(demoMode){renderAll();return;}
  await loadRemoteData();progress=await loadProgress();renderAll();
}
async function authSubmit(e) {
  e.preventDefault();
  const email=$("#auth-email").value.trim(), password=$("#auth-password").value, name=$("#auth-name").value.trim();
  const button=$("#auth-submit");button.disabled=true;button.textContent="Please wait…";
  try {
    if(!fb) throw new Error("Firebase isn't ready. Check your config.");
    if(authMode==="signup") {
      const credential=await fb.createUserWithEmailAndPassword(fb.auth,email,password);
      if(name) await fb.updateProfile(credential.user,{displayName:name});
      await fb.setDoc(fb.doc(fb.db,"users",credential.user.uid),{uid:credential.user.uid,email,displayName:name||email.split("@")[0],role:"student",createdAt:Date.now()});
      toast("Account created. Welcome to ClassSpace!");
    } else { await fb.signInWithEmailAndPassword(fb.auth,email,password);toast("Signed in successfully."); }
  } catch(e) { toast(friendlyAuthError(e),true); }
  finally {button.disabled=false;button.innerHTML=authMode==="signin"?'Sign in <span>→</span>':'Create account <span>→</span>';}
}
function friendlyAuthError(e) {
  const code=e?.code||"";
  return ({"auth/invalid-credential":"Email or password is incorrect.","auth/email-already-in-use":"An account with this email already exists.","auth/weak-password":"Choose a stronger password (at least 6 characters).","auth/invalid-email":"Enter a valid email address.","auth/too-many-requests":"Too many attempts. Try again later.","auth/network-request-failed":"Network error. Check your connection."})[code]||e.message||"Something went wrong.";
}
function renderAll() {
  updateStats(); renderSubjects();renderLessonGrid($("#continue-grid"),lessons.slice(0,3));renderRecordingView();renderNotes();renderProgress();renderAdmin();
}
function updateStats() {
  $("#stat-lessons").textContent=lessons.length;
  $("#stat-hours").innerHTML=`${Math.floor(totalWatched()/3600)}<span class="stat-unit">h</span>`;
  $("#stat-minutes").textContent=`${Math.floor((totalWatched()%3600)/60)}m`;
  $("#stat-completed").textContent=completedCount();
}
function renderSubjects() {
  const html=subjects.map((s,i)=>`<button class="subject-card" data-subject="${escapeHtml(s.id)}"><span class="subject-icon">${escapeHtml(s.icon||"▤")}</span><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description||"Explore lessons and class resources for this subject.")}</p><div class="subject-card-foot"><span>${lessons.filter(l=>l.subjectId===s.id).length} recordings · ${notes.filter(n=>n.subjectId===s.id).length} notes</span><span>↗</span></div></button>`).join("");
  $("#subject-grid").innerHTML=html||emptyState("No subjects yet","Your class subjects will appear here.");
  $("#subjects-page-grid").innerHTML=html||emptyState("No subjects yet","Ask your class admin to add a subject.");
}
function emptyState(title,description) { return `<div class="empty-state"><div class="empty-icon">✦</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`; }
function renderLessonGrid(target,list) {
  if(!list.length){target.innerHTML=emptyState("No recordings yet","New class recordings will appear here when your admin adds them.");return;}
  target.innerHTML=list.map((l,i)=>`<article class="lesson-card"><div class="lesson-thumb tone-${(i%4)+1}"><span class="thumb-label">${escapeHtml(subjectName(l.subjectId).toUpperCase())}</span><button class="thumb-play" data-play="${escapeHtml(l.id)}" aria-label="Play ${escapeHtml(l.title)}">▶</button><span class="thumb-duration">${escapeHtml(l.duration||"Recording")}</span></div><div class="lesson-body"><div class="lesson-meta"><span>▶</span>${escapeHtml(subjectName(l.subjectId))}</div><h3>${escapeHtml(l.title)}</h3><p>${escapeHtml(l.description||"Class recording available to revisit anytime.")}</p><div class="lesson-foot"><span>${lessonDone(l.id)?"✓ Completed":lessonWatched(l.id)>0?`${Math.floor(lessonWatched(l.id)/60)} min watched`:"Ready to watch"}</span><button class="lesson-action" data-play="${escapeHtml(l.id)}">${lessonWatched(l.id)>0?"Continue":"Watch lesson"} →</button></div></div></article>`).join("");
}
function renderRecordingView() {
  const filters=[{id:"all",name:"All lessons"},...subjects.map(s=>({id:s.id,name:s.name}))];
  $("#recording-filters").innerHTML=filters.map(f=>`<button class="filter-pill ${activeFilter===f.id?"active":""}" data-filter="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`).join("");
  let list=lessons.filter(l=>activeFilter==="all"||l.subjectId===activeFilter);
  if($("#recording-sort").value==="title")list.sort((a,b)=>a.title.localeCompare(b.title));else list.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("#recordings-count").textContent=`${list.length} lesson${list.length===1?"":"s"}`;
  renderLessonGrid($("#recordings-grid"),list);
}
function renderNotes() {
  if(!notes.length){$("#notes-grid").innerHTML=emptyState("No PDF notes yet","Your admin can add a PDF link for each class resource.");return;}
  $("#notes-grid").innerHTML=notes.map(n=>`<article class="note-card"><div class="pdf-icon">PDF</div><div class="note-copy"><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(subjectName(n.subjectId))} · ${escapeHtml(n.description||"Class resource")}</p></div><div class="note-actions"><a class="note-action" href="${escapeHtml(safeUrl(n.pdfUrl))}" target="_blank" rel="noopener noreferrer">Open ↗</a></div></article>`).join("");
}
function renderProgress() {
  const total=totalWatched(), minutes=Math.floor(total/60), pct=Math.min(100,Math.round(total/3600/10*100));
  $("#progress-time").textContent=timeText(total);$("#progress-meter-fill").style.width=`${pct}%`;
  $("#progress-percent").textContent=`${minutes} min`;$("#progress-available").textContent=lessons.length;
  $("#progress-done").textContent=completedCount();$("#progress-subjects").textContent=subjects.length;
  const rows=Object.entries(progress).filter(([id,p])=>Number(p.seconds)>0||p.completed).sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0)).slice(0,8);
  $("#activity-list").innerHTML=rows.length?rows.map(([id,p])=>{const l=lessons.find(x=>x.id===id);return `<div class="activity-row"><div class="activity-symbol">${p.completed?"✓":"▷"}</div><div class="activity-copy"><strong>${escapeHtml(l?.title||"Previous lesson")}</strong><small>${escapeHtml(subjectName(l?.subjectId))} · ${p.completed?"Completed":`${Math.floor((p.seconds||0)/60)} min watched`}</small></div><span class="activity-time">${p.updatedAt?new Date(p.updatedAt).toLocaleDateString():"In progress"}</span></div>`;}).join(""):emptyState("Your learning activity will show here","Watch a recording to start tracking your progress.");
}
function renderAdmin() {
  if(currentRole!=="admin")return;
  const kind=adminTab, title=kind==="lessons"?"Manage recordings":kind==="subjects"?"Manage subjects":"Manage PDF notes";
  $("#admin-list-title").textContent=title;$("#admin-list-subtitle").textContent=kind==="lessons"?"Add or update YouTube class recordings.":kind==="subjects"?"Organise subjects for your class.":"Share PDF notes and handouts with students.";
  $("#add-content-button").innerHTML=`＋ Add ${kind==="lessons"?"recording":kind==="subjects"?"subject":"PDF note"}`;
  const list=kind==="lessons"?lessons:kind==="subjects"?subjects:notes;
  const icon=kind==="lessons"?"▷":kind==="subjects"?"▤":"PDF";
  $("#admin-content-list").innerHTML=list.length?list.map(item=>`<div class="admin-row"><div class="admin-row-icon">${icon}</div><div class="admin-row-copy"><strong>${escapeHtml(item.title||item.name)}</strong><small>${escapeHtml(kind==="subjects"?(item.description||"Subject"):subjectName(item.subjectId))} · ${kind==="lessons"?"YouTube recording":kind==="subjects"?"Subject":"PDF resource"}</small></div><div class="admin-row-actions"><button class="tiny-button" data-edit="${escapeHtml(item.id)}" data-kind="${kind}">Edit</button><button class="tiny-button danger" data-delete="${escapeHtml(item.id)}" data-kind="${kind}">Delete</button></div></div>`).join(""):emptyState(`No ${kind} yet`,`Use “Add ${kind==="lessons"?"recording":kind==="subjects"?"subject":"PDF note"}” to publish your first resource.`);
}
function navigate(view) {
  if(view==="admin"&&currentRole!=="admin"){toast("Admin access is required.",true);return;}
  currentView=view;$$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${view}`));
  $$(".nav-item[data-view]").forEach(v=>v.classList.toggle("active",v.dataset.view===view));
  $("#page-breadcrumb").textContent=({overview:"Overview",recordings:"Recordings",subjects:"Subjects",notes:"PDF notes",progress:"My progress",admin:"Admin studio"})[view]||"Overview";
  $("#sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
}
function openPlayer(id) {
  const lesson=lessons.find(l=>l.id===id);if(!lesson)return;
  const vid=youtubeId(lesson.youtubeUrl||"");
  if(!vid){toast("This recording doesn't have a valid YouTube URL.",true);return;}
  stopWatchTracking();currentLesson=lesson;sessionWatched=0;lastSaveAt=0;
  $("#player-title").textContent=lesson.title;$("#player-subtitle").textContent=`${subjectName(lesson.subjectId)} · Class recording`;
  $("#player-description").textContent=lesson.description||"Revisit this class recording whenever you need.";
  $("#mark-complete").textContent=lessonDone(id)?"✓ Completed":"✓ Mark complete";
  $("#player-notice").classList.add("hidden");
  $("#player-modal").classList.remove("hidden");document.body.style.overflow="hidden";
  const frame=$("#youtube-player");frame.innerHTML=`<iframe id="youtube-iframe" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}&rel=0" title="${escapeHtml(lesson.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  // YouTube IFrame API is used only for playback-state-based time tracking.
  loadYouTubeApi();
}
function loadYouTubeApi() {
  if(window.YT?.Player){attachPlayer();return;}
  if(!document.querySelector('script[data-youtube-api]')){const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";s.dataset.youtubeApi="true";document.head.appendChild(s);}
  const old=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{if(typeof old==="function")old();attachPlayer();};
}
function attachPlayer() {
  if(!$("#youtube-iframe")||!window.YT?.Player)return;
  try {
    ytPlayer=new YT.Player("youtube-iframe",{events:{onReady:()=>{},onStateChange:e=>{
      if(e.data===YT.PlayerState.PLAYING)startWatchTracking();
      else stopWatchTracking();
    }}});
  } catch(e){console.warn("YouTube tracking API unavailable",e);}
}
function startWatchTracking() {
  if(watchTimer)return;lastTick=Date.now();
  watchTimer=setInterval(()=>{
    const now=Date.now(),delta=Math.min((now-lastTick)/1000,5);lastTick=now;
    sessionWatched+=Math.max(0,delta);
    const id=currentLesson?.id;if(!id)return;
    progress[id]=progress[id]||{seconds:0,completed:false};
    progress[id].seconds=Number(progress[id].seconds||0)+Math.max(0,delta);
    progress[id].updatedAt=Date.now();
    if(demoMode)localStorage.setItem(`classspace-progress-${currentUser.uid}`,JSON.stringify(progress));
    if(now-lastSaveAt>15000){lastSaveAt=now;saveProgress(id).catch(e=>console.warn("Progress save failed",e));}
    updateStats();
  },1000);
}
function stopWatchTracking() {
  if(watchTimer){clearInterval(watchTimer);watchTimer=null;}
  if(currentLesson&&sessionWatched>0)saveProgress(currentLesson.id).catch(e=>console.warn("Progress save failed",e));
}
async function saveProgress(id) {
  if(!currentUser||!progress[id])return;
  if(demoMode){localStorage.setItem(`classspace-progress-${currentUser.uid}`,JSON.stringify(progress));return;}
  await fb.setDoc(fb.doc(fb.db,"users",currentUser.uid,"progress",id),progress[id],{merge:true});
}
async function closePlayer() {
  stopWatchTracking();try{ytPlayer?.destroy?.();}catch{}ytPlayer=null;currentLesson=null;
  $("#youtube-player").innerHTML="";$("#player-modal").classList.add("hidden");document.body.style.overflow="";
  if(!demoMode){try{progress=await loadProgress();}catch{}}renderAll();
}
async function markComplete() {
  if(!currentLesson)return;const id=currentLesson.id;
  progress[id]=progress[id]||{seconds:0};progress[id].completed=true;progress[id].updatedAt=Date.now();
  try{await saveProgress(id);$("#mark-complete").textContent="✓ Completed";toast("Lesson marked as complete.");renderAll();}
  catch(e){toast("Couldn't save progress. Check your connection and security rules.",true);}
}
function openContentForm(kind,item=null) {
  $("#content-kind").value=kind;$("#content-id").value=item?.id||"";
  const label=kind==="lessons"?"recording":kind==="subjects"?"subject":"PDF note";
  $("#content-modal-title").textContent=`${item?"Edit":"Add"} ${label}`;
  $("#content-modal-description").textContent=kind==="lessons"?"Add a YouTube class recording to your library.":kind==="subjects"?"Create a subject students can browse.":"Share a PDF handout with your class.";
  const subjectSelect=`<div class="form-field full"><label for="field-subject">Subject *</label><select id="field-subject" required><option value="">Choose a subject</option>${subjects.map(s=>`<option value="${escapeHtml(s.id)}" ${item?.subjectId===s.id?"selected":""}>${escapeHtml(s.name)}</option>`).join("")}</select></div>`;
  let fields="";
  if(kind==="subjects") fields=`<div class="form-grid"><div class="form-field full"><label for="field-name">Subject name *</label><input id="field-name" required maxlength="80" value="${escapeHtml(item?.name||"")}" placeholder="e.g. Mathematics"></div><div class="form-field"><label for="field-icon">Icon / symbol</label><input id="field-icon" maxlength="8" value="${escapeHtml(item?.icon||"▤")}" placeholder="∑"></div><div class="form-field full"><label for="field-description">Description</label><textarea id="field-description" maxlength="500" placeholder="What will students learn?">${escapeHtml(item?.description||"")}</textarea></div></div>`;
  else if(kind==="lessons") fields=`<div class="form-grid"><div class="form-field full"><label for="field-title">Recording title *</label><input id="field-title" required maxlength="140" value="${escapeHtml(item?.title||"")}" placeholder="Lesson 01 — Introduction"></div>${subjectSelect}<div class="form-field full"><label for="field-youtube">YouTube URL *</label><input id="field-youtube" type="url" required value="${escapeHtml(item?.youtubeUrl||"")}" placeholder="https://www.youtube.com/watch?v=..."><span class="hint">Use a public or unlisted YouTube video you have permission to share. Private videos won't play for students.</span></div><div class="form-field"><label for="field-duration">Duration (optional)</label><input id="field-duration" maxlength="20" value="${escapeHtml(item?.duration||"")}" placeholder="e.g. 42:15"></div><div class="form-field full"><label for="field-description">Description</label><textarea id="field-description" maxlength="800" placeholder="Lesson summary...">${escapeHtml(item?.description||"")}</textarea></div></div>`;
  else fields=`<div class="form-grid"><div class="form-field full"><label for="field-title">PDF title *</label><input id="field-title" required maxlength="140" value="${escapeHtml(item?.title||"")}" placeholder="Lesson 01 — Notes"></div>${subjectSelect}<div class="form-field full"><label for="field-pdf">PDF URL *</label><input id="field-pdf" type="url" required value="${escapeHtml(item?.pdfUrl||"")}" placeholder="https://.../notes.pdf"><span class="hint">Use a publicly accessible HTTPS PDF URL. This starter stores a link, not the PDF file itself.</span></div><div class="form-field full"><label for="field-description">Description</label><textarea id="field-description" maxlength="500" placeholder="What is included in these notes?">${escapeHtml(item?.description||"")}</textarea></div></div>`;
  $("#content-fields").innerHTML=fields;$("#content-modal").classList.remove("hidden");document.body.style.overflow="hidden";
}
function closeContentForm(){ $("#content-modal").classList.add("hidden");document.body.style.overflow=""; }
async function saveContent(e) {
  e.preventDefault();if(currentRole!=="admin"){toast("Admin access is required.",true);return;}
  const kind=$("#content-kind").value,id=$("#content-id").value;
  const data={};
  if(kind==="subjects"){
    data.name=$("#field-name").value.trim();data.icon=$("#field-icon").value.trim()||"▤";data.description=$("#field-description").value.trim();
  } else if(kind==="lessons"){
    data.title=$("#field-title").value.trim();data.subjectId=$("#field-subject").value;data.youtubeUrl=safeUrl($("#field-youtube").value.trim());data.duration=$("#field-duration").value.trim();data.description=$("#field-description").value.trim();
    if(!youtubeId(data.youtubeUrl)){toast("Enter a valid YouTube video URL.",true);return;}
  } else {
    data.title=$("#field-title").value.trim();data.subjectId=$("#field-subject").value;data.pdfUrl=safeUrl($("#field-pdf").value.trim());data.description=$("#field-description").value.trim();
    if(!data.pdfUrl){toast("Enter a valid PDF URL.",true);return;}
  }
  if(kind!=="subjects"&&!data.subjectId){toast("Choose a subject.",true);return;}
  const btn=$("#save-content");btn.disabled=true;btn.textContent="Saving…";
  try {
    data.updatedAt=Date.now();if(!id)data.createdAt=Date.now();
    if(demoMode){
      const list=kind==="subjects"?subjects:kind==="lessons"?lessons:notes;
      if(id){const ix=list.findIndex(x=>x.id===id);if(ix>=0)list[ix]={...list[ix],...data};}
      else list.unshift({id:`demo-${kind}-${Date.now()}`,...data});
    } else {
      const collection=fb.collection(fb.db,kind);
      if(id)await fb.updateDoc(fb.doc(fb.db,kind,id),data);
      else await fb.addDoc(collection,data);
      await loadRemoteData();
    }
    closeContentForm();renderAll();toast(`${id?"Updated":"Added"} successfully.`);
  } catch(e){console.error(e);toast("Couldn't save. Check your admin role and Firestore rules.",true);}
  finally{btn.disabled=false;btn.innerHTML="Save resource <span>→</span>";}
}
async function deleteContent(kind,id) {
  if(currentRole!=="admin")return;
  const label=kind==="lessons"?"recording":kind==="subjects"?"subject":"PDF note";
  if(!confirm(`Delete this ${label}? This action cannot be undone.`))return;
  try{
    if(demoMode){const key=kind==="subjects"?"subjects":kind==="lessons"?"lessons":"notes";const arr=kind==="subjects"?subjects:kind==="lessons"?lessons:notes;const ix=arr.findIndex(x=>x.id===id);if(ix>=0)arr.splice(ix,1);}
    else{await fb.deleteDoc(fb.doc(fb.db,kind,id));await loadRemoteData();}
    renderAll();toast(`${label[0].toUpperCase()+label.slice(1)} deleted.`);
  }catch(e){toast("Couldn't delete. Check your admin role and Firestore rules.",true);}
}
function doSearch(q) {
  const query=q.trim().toLowerCase();if(!query)return;
  navigate("recordings");activeFilter="all";
  const results=lessons.filter(l=>`${l.title} ${l.description||""} ${subjectName(l.subjectId)}`.toLowerCase().includes(query));
  renderLessonGrid($("#recordings-grid"),results);
  $("#recordings-count").textContent=`${results.length} result${results.length===1?"":"s"}`;
  $("#recording-filters").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.filter==="all"));
}
function wireEvents() {
  $$(".auth-tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.authMode)));
  $("#auth-form").addEventListener("submit",authSubmit);
  $("#toggle-password").addEventListener("click",()=>{const input=$("#auth-password");input.type=input.type==="password"?"text":"password";});
  $("#forgot-password").addEventListener("click",async()=>{
    const email=$("#auth-email").value.trim();if(!email){toast("Enter your email address first.",true);return;}
    try{await fb.sendPasswordResetEmail(fb.auth,email);toast("Password reset email sent.");}catch(e){toast(friendlyAuthError(e),true);}
  });
  $("#demo-student").addEventListener("click",()=>enterDemo("student"));
  $("#demo-admin").addEventListener("click",()=>enterDemo("admin"));
  $$("[data-view]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
  $$("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
  $("#sidebar-logout").addEventListener("click",async()=>{if(demoMode){demoUser=null;currentUser=null;currentRole="student";showAuth();}else await fb.signOut(fb.auth);});
  $("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#global-search").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch(e.target.value);});
  $("#global-search").addEventListener("input",e=>{if(!e.target.value.trim()&&currentView==="recordings")renderRecordingView();});
  $("#recording-filters").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;renderRecordingView();});
  $("#recording-sort").addEventListener("change",renderRecordingView);
  document.addEventListener("click",e=>{
    const play=e.target.closest("[data-play]");if(play){openPlayer(play.dataset.play);return;}
    const subject=e.target.closest("[data-subject]");if(subject){activeFilter=subject.dataset.subject;navigate("recordings");renderRecordingView();return;}
    const edit=e.target.closest("[data-edit]");if(edit){const kind=edit.dataset.kind,arr=kind==="subjects"?subjects:kind==="lessons"?lessons:notes;openContentForm(kind,arr.find(x=>x.id===edit.dataset.edit));return;}
    const del=e.target.closest("[data-delete]");if(del){deleteContent(del.dataset.kind,del.dataset.delete);return;}
    if(e.target.closest("[data-close-player]"))closePlayer();
    if(e.target.closest("[data-close-content]"))closeContentForm();
  });
  $("#mark-complete").addEventListener("click",markComplete);
  $$(".admin-tab").forEach(b=>b.addEventListener("click",()=>{adminTab=b.dataset.adminTab;$$(".admin-tab").forEach(x=>x.classList.toggle("active",x===b));renderAdmin();}));
  $("#add-content-button").addEventListener("click",()=>openContentForm(adminTab));
  $("#content-form").addEventListener("submit",saveContent);
  $("#profile-menu").addEventListener("click",()=>toast(`${currentUser?.email||"Demo account"} · ${currentRole}`));
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){if(!$("#player-modal").classList.contains("hidden"))closePlayer();if(!$("#content-modal").classList.contains("hidden"))closeContentForm();$("#sidebar").classList.remove("open");}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#global-search").focus();}
  });
  window.addEventListener("beforeunload",()=>{if(currentLesson&&sessionWatched>0)saveProgress(currentLesson.id);});
}
async function boot() {
  wireEvents();setAuthMode("signin");
  if(!isFirebaseConfigured){
    $("#demo-notice").classList.remove("hidden");$("#demo-buttons").classList.remove("hidden");
    $("#auth-mode-note").textContent="Demo mode — configure Firebase for secure accounts";
    return;
  }
  try { await initFirebase(); }
  catch(e){console.error(e);toast("Firebase could not start. Check firebase-config.js.",true);}
}
boot();
