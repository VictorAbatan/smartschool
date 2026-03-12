import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
  query, where, getDocs, addDoc, onSnapshot, serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAk8lgaU1c7n2-Mt3TetoUE2JGJDA7U6F8",
  authDomain:        "smartschool-system.firebaseapp.com",
  projectId:         "smartschool-system",
  storageBucket:     "smartschool-system.firebasestorage.app",
  messagingSenderId: "122165307933",
  appId:             "1:122165307933:web:a604d91489aa62924434f4"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

let teacherData       = null;
let notifUnsubscribe  = null;   // realtime listener cleanup
let caConfig          = [20, 20]; // default: CA1=20, CA2=20, Exam=60

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function toast(msg, type = "info") {
  const box = document.getElementById("toastBox"); if (!box) return;
  const cols = { success:"#059669", error:"#dc2626", warning:"#d97706", info:"#2563eb" };
  const icons = { success:"✅", error:"❌", warning:"⚠️", info:"ℹ️" };
  const el = document.createElement("div");
  el.style.cssText = `background:${cols[type]||cols.info};color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;font-weight:600;display:flex;gap:10px;align-items:flex-start;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:all;line-height:1.4`;
  el.innerHTML = `<span style="flex-shrink:0">${icons[type]||""}</span><span>${msg}</span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function getGrade(t) {
  if (t >= 70) return "A";
  if (t >= 60) return "B";
  if (t >= 50) return "C";
  if (t >= 45) return "D";
  if (t >= 40) return "E";
  return "F";
}

/* ═══════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════ */
const sidebar        = document.getElementById("sidebar");
const mainArea       = document.getElementById("mainArea");
const sidebarToggle  = document.getElementById("sidebarToggle");
const mobileToggle   = document.getElementById("mobileToggle");
const sidebarOverlay = document.getElementById("sidebarOverlay");

sidebarToggle?.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  mainArea.classList.toggle("collapsed");
});
mobileToggle?.addEventListener("click", () => {
  sidebar.classList.add("mobile-open");
  sidebarOverlay.classList.add("active");
});
sidebarOverlay?.addEventListener("click", () => {
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
});

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
const SECTION_NAMES = {
  dashboard:        "Dashboard",
  students:         "Students",
  "enter-scores":   "Enter Scores",
  "submit-results": "Submit Results",
  collate:          "Collate Results",
  reportcards:      "Report Cards",
  attendance:       "Attendance",
  assignments:      "Assignments",
  tests:            "Tests & CA",
  resources:        "Resources",
  messages:         "Messages",
  profile:          "My Profile",
  settings:         "Settings"
};

function switchSection(name) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add("active");
  document.getElementById(`sec-${name}`)?.classList.add("active");
  document.getElementById("sectionTitle").textContent = SECTION_NAMES[name] || name;
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");

  // Lazy loaders
  if (name === "assignments")     loadAssignments();
  if (name === "tests")           loadTests();
  if (name === "resources")       loadResources();
  if (name === "students")        loadStudents();
  if (name === "profile")         loadSignaturePreview();
  if (name === "submit-results")  syncSubmitDropdowns();
  if (name === "collate")         {}   // triggered by button
  if (name === "reportcards")     loadReportStudentList();
}

document.querySelectorAll(".nav-item").forEach(btn =>
  btn.addEventListener("click", () => switchSection(btn.dataset.section))
);

/* ═══════════════════════════════════════
   SEARCH
═══════════════════════════════════════ */
async function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) {
    // Clear all filters
    document.querySelectorAll("#studentsTbody tr").forEach(r => r.style.display = "");
    document.querySelectorAll(".assign-card").forEach(c => c.style.display = "");
    return;
  }

  // If students section is active — search student rows, loading if needed
  const studSec = document.getElementById("sec-students");
  if (studSec?.classList.contains("active")) {
    if (document.querySelectorAll("#studentsTbody tr[data-loaded]").length === 0) {
      await loadStudents();
    }
    let hits = 0;
    document.querySelectorAll("#studentsTbody tr").forEach(r => {
      const match = r.textContent.toLowerCase().includes(q);
      r.style.display = match ? "" : "none";
      if (match) hits++;
    });
    return;
  }

  // Assignments section
  const asgSec = document.getElementById("sec-assignments");
  if (asgSec?.classList.contains("active")) {
    if (!document.querySelector(".assign-card")) await loadAssignments();
    document.querySelectorAll(".assign-card").forEach(c => {
      c.style.display = c.textContent.toLowerCase().includes(q) ? "" : "none";
    });
    return;
  }

  // Global: search students first, then assignments, navigate to whichever has hits
  if (document.querySelectorAll("#studentsTbody tr").length <= 1) await loadStudents();
  let sHits = 0;
  document.querySelectorAll("#studentsTbody tr").forEach(r => {
    const match = r.textContent.toLowerCase().includes(q);
    r.style.display = match ? "" : "none";
    if (match) sHits++;
  });
  if (sHits > 0) { switchSection("students"); return; }

  if (!document.querySelector(".assign-card")) await loadAssignments();
  let aHits = 0;
  document.querySelectorAll(".assign-card").forEach(c => {
    const match = c.textContent.toLowerCase().includes(q);
    c.style.display = match ? "" : "none";
    if (match) aHits++;
  });
  if (aHits > 0) { switchSection("assignments"); return; }

  toast(`No results for "${q}"`, "info");
}

const searchInput = document.getElementById("teacherSearch");
const searchBtn   = document.getElementById("searchBtn");
searchInput?.addEventListener("input",  debounce(e => runSearch(e.target.value), 350));
searchInput?.addEventListener("keydown", e => { if (e.key === "Enter") runSearch(e.target.value); });
searchBtn?.addEventListener("click", () => runSearch(searchInput?.value || ""));

/* ═══════════════════════════════════════
   THEME
═══════════════════════════════════════ */
function setTheme(dark) {
  document.body.classList.toggle("light-mode", !dark);
  const tt = document.getElementById("themeToggle");
  if (tt) tt.textContent = dark ? "🌙" : "☀️";
  const ds = document.getElementById("darkModeSwitch");
  if (ds) ds.checked = dark;
  localStorage.setItem("smartschool_theme", dark ? "dark" : "light");
}
setTheme(localStorage.getItem("smartschool_theme") !== "light");
document.getElementById("themeToggle")?.addEventListener("click",
  () => setTheme(document.body.classList.contains("light-mode")));
document.getElementById("darkModeSwitch")?.addEventListener("change",
  e => setTheme(e.target.checked));

/* ═══════════════════════════════════════
   NOTIFICATIONS — realtime listener (fixes inconsistency)
═══════════════════════════════════════ */
const notifWrapper = document.getElementById("notifWrapper");
document.getElementById("notificationBtn")?.addEventListener("click",
  () => notifWrapper.classList.toggle("open"));
document.addEventListener("click",
  e => { if (notifWrapper && !notifWrapper.contains(e.target)) notifWrapper.classList.remove("open"); });

function startNotifListener(uid) {
  if (notifUnsubscribe) notifUnsubscribe();

  // Query ONLY by userId — no composite index needed.
  // Filtering by read==false in Firestore requires a composite index that may not exist.
  // We filter in JS instead, which is reliable.
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", uid)
  );

  notifUnsubscribe = onSnapshot(q, snap => {
    const badge      = document.getElementById("notifBadge");
    const dropdown   = document.getElementById("notificationDropdown");
    const dashList   = document.getElementById("dashNotifList");
    const statNotifs = document.getElementById("statNotifs");

    // Filter unread in JS
    const unread = snap.docs.filter(d => d.data().read !== true);
    const count  = unread.length;

    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? "flex" : "none"; }
    if (statNotifs) statNotifs.textContent = count;

    // Dashboard notification list (most recent 5 unread)
    if (dashList) {
      if (count === 0) {
        dashList.innerHTML = `<p class="empty-msg">No new notifications.</p>`;
      } else {
        dashList.innerHTML = "";
        unread.slice(0, 5).forEach(d => {
          const n    = d.data();
          const icon = n.type === "submission" ? "📌" : n.type === "result" ? "📊" : n.type === "grade" ? "🏆" : "🔔";
          const item = document.createElement("div");
          item.style.cssText = "padding:8px 0;border-bottom:1px solid var(--card-border);font-size:13px;display:flex;gap:8px;align-items:flex-start";
          item.innerHTML = `<span style="flex-shrink:0">${icon}</span>
            <span style="flex:1;line-height:1.5;color:var(--text)">${n.message}</span>
            <button data-id="${d.id}" class="nr-btn" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;flex-shrink:0" title="Mark read">✓</button>`;
          dashList.appendChild(item);
        });
        dashList.querySelectorAll(".nr-btn").forEach(btn =>
          btn.addEventListener("click", async () =>
            setDoc(doc(db, "notifications", btn.dataset.id), { read: true }, { merge: true }))
        );
      }
    }

    // Dropdown
    if (!dropdown) return;
    if (count === 0) {
      dropdown.innerHTML = `<p class="notif-empty">All caught up! 🎉</p>`;
      return;
    }
    dropdown.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${count} unread</span>
      <button id="markAllRead" style="background:none;border:none;color:var(--accent);font-size:11px;font-weight:600;cursor:pointer">Mark all read</button>
    </div>`;

    unread.forEach(d => {
      const n    = d.data();
      const icon = n.type === "submission" ? "📌" : n.type === "result" ? "📊" : n.type === "grade" ? "🏆" : "🔔";
      const item = document.createElement("div");
      item.style.cssText = "padding:9px 0;border-bottom:1px solid var(--card-border);display:flex;gap:8px;align-items:flex-start";
      item.innerHTML = `<span style="font-size:16px;flex-shrink:0">${icon}</span>
        <span style="flex:1;font-size:13px;color:var(--text);line-height:1.5">${n.message}</span>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button data-id="${d.id}" class="nd-read" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px" title="Mark read">✓</button>
          <button data-id="${d.id}" class="nd-del"  style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px"   title="Delete">✕</button>
        </div>`;
      item.querySelector(".nd-read").addEventListener("click", () =>
        setDoc(doc(db, "notifications", d.id), { read: true }, { merge: true }));
      item.querySelector(".nd-del").addEventListener("click", () =>
        deleteDoc(doc(db, "notifications", d.id)));
      dropdown.appendChild(item);
    });

    dropdown.querySelector("#markAllRead")?.addEventListener("click", async () => {
      await Promise.all(unread.map(d =>
        setDoc(doc(db, "notifications", d.id), { read: true }, { merge: true })
      ));
    });
  }, err => {
    console.error("Notif listener error:", err);
    // Fallback message so badge isn't stuck
    const badge = document.getElementById("notifBadge");
    if (badge) badge.style.display = "none";
  });
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "teacher-login.html"; return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) { alert("Teacher record not found."); return; }
    teacherData = { ...snap.data(), _uid: user.uid };
    applyRole(teacherData.teacherType);
    fillUI(teacherData);
    populateDropdowns(teacherData);
    initChart(teacherData);
    loadDashboardStats();
    startNotifListener(user.uid);   // realtime notifications
  } catch (err) {
    console.error("Auth error:", err);
    alert("Error loading profile: " + err.message);
  }
});

/* ═══════════════════════════════════════
   APPLY ROLE
═══════════════════════════════════════ */
function applyRole(role) {
  const isSubject = role === "subject";
  if (isSubject) {
    document.querySelectorAll(".role-both").forEach(el => el.style.display = "none");
  }

  // Build quick actions
  const qaGrid = document.getElementById("quickActionsGrid"); if (!qaGrid) return;
  const actions = isSubject
    ? [
        { icon:"📝", label:"Enter Scores",   s:"enter-scores"   },
        { icon:"📤", label:"Submit Results",  s:"submit-results" },
        { icon:"📌", label:"Assignments",     s:"assignments"    },
        { icon:"📚", label:"Resources",       s:"resources"      }
      ]
    : [
        { icon:"📊", label:"Collate Results", s:"collate"        },
        { icon:"📄", label:"Report Cards",    s:"reportcards"    },
        { icon:"📌", label:"Assignments",     s:"assignments"    },
        { icon:"📋", label:"Attendance",      s:"attendance"     }
      ];

  qaGrid.innerHTML = actions.map(a =>
    `<button class="qa-btn" data-section="${a.s}"><span>${a.icon}</span>${a.label}</button>`
  ).join("");
  qaGrid.querySelectorAll(".qa-btn").forEach(b =>
    b.addEventListener("click", () => switchSection(b.dataset.section)));
}

/* ═══════════════════════════════════════
   FILL UI
═══════════════════════════════════════ */
function fillUI(data) {
  const roleLabel = data.teacherType === "both" ? "Class Teacher" : "Subject Teacher";
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set("sbName",        data.name  || "Teacher");
  set("sbRole",        roleLabel);
  set("topbarName",    (data.name || "Teacher").split(" ")[0]);
  set("profName",      data.name  || "--");
  set("profNameVal",   data.name  || "--");
  set("profEmail",     data.email || "--");
  set("profSchool",    data.school || "Not set");
  set("profType",      roleLabel);
  set("profRoleBadge", roleLabel);
  set("schoolBannerName", data.school || "Your School");

 // Load school logo
const slug = (data.school || "").toLowerCase().replace(/\s+/g, "_");
if (slug) {
  getDoc(doc(db, "schoolSettings", slug)).then(snap => {
    const logoEl = document.getElementById("schoolLogoEl");
    if (!logoEl) return;
    if (snap.exists() && snap.data().logoUrl) {
      logoEl.innerHTML = `<img src="${snap.data().logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
    } else {
      logoEl.textContent = (data.school || "S")[0].toUpperCase();
    }
  }).catch(() => {
    const logoEl = document.getElementById("schoolLogoEl");
    if (logoEl) logoEl.textContent = (data.school || "S")[0].toUpperCase();
  });
} else {
  const logoEl = document.getElementById("schoolLogoEl");
  if (logoEl) logoEl.textContent = "S";
}

  const dateEl = document.getElementById("schoolBannerDate");
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-NG",
    { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  if (data.profileImage) {
    ["sbProfileImg","profilePreview","topbarImg"].forEach(id => {
      const el = document.getElementById(id); if (el) el.src = data.profileImage;
    });
  }

  const profClassEl = document.getElementById("profClass");
  if (profClassEl) {
    if (data.teacherType === "both" && data.mainClass) profClassEl.textContent = data.mainClass;
    else profClassEl.closest(".detail-item")?.style?.setProperty("display","none");
  }

  const ps = document.getElementById("profSubjects");
  if (ps) ps.innerHTML = (data.subjectsTaught || []).map(s => `<span class="tag">${s}</span>`).join("");
  const pc = document.getElementById("profClasses");
  if (pc) pc.innerHTML = (data.classesTeaching || []).map(c => `<span class="tag">${c}</span>`).join("");

  // Signature preview — run now so it's ready when profile tab is opened
  loadSignaturePreview();
}

/* ═══════════════════════════════════════
   POPULATE DROPDOWNS
═══════════════════════════════════════ */
function populateDropdowns(data) {
  const classes  = data.classesTeaching || [];
  const subjects = data.subjectsTaught  || [];

  const classIds   = ["scoresClassFilter","attendClassFilter",
                      "resClass","studentsClassFilter","submitClassFilter"];
  const subjectIds = ["scoresSubjectFilter","assignSubject","resSubject","submitSubjectFilter"];

  classIds.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option value="">${id === "studentsClassFilter" ? "All Classes" : "Select Class"}</option>`;
    classes.forEach(c => el.innerHTML += `<option value="${c}">${c}</option>`);
  });

  // Build assignClassList checkboxes for multi-class assignment
  const assignClassList = document.getElementById("assignClassList");
  if (assignClassList) {
    assignClassList.innerHTML = classes.map(c =>
      `<label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--bg2);border:1px solid var(--card-border);border-radius:8px;font-size:12px;cursor:pointer">
        <input type="checkbox" class="assign-class-chk" value="${c}"> ${c}
      </label>`
    ).join("");
  }

  subjectIds.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = `<option value="">Select Subject</option>`;
    subjects.forEach(s => el.innerHTML += `<option value="${s}">${s}</option>`);
  });
}

/* ═══════════════════════════════════════
   DASHBOARD STATS
═══════════════════════════════════════ */
async function loadDashboardStats() {
  if (!teacherData) return;
  const classes = teacherData.classesTeaching || [];
  if (!classes.length) return;
  try {
    const ss = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","in",classes)));
    const sEl = document.getElementById("statStudents"); if (sEl) sEl.textContent = ss.size;

    const as = await getDocs(query(collection(db,"assignments"),
      where("teacherId","==",teacherData._uid)));
    const aEl = document.getElementById("statAssignments"); if (aEl) aEl.textContent = as.size;

    if (teacherData.teacherType === "both" && teacherData.mainClass) {
      const ps = await getDocs(query(collection(db,"scoreSubmissions"),
        where("class","==",teacherData.mainClass), where("status","==","submitted")));
      const pEl = document.getElementById("statPending"); if (pEl) pEl.textContent = ps.size;
    }
  } catch (err) { console.error("Stats:", err); }
}

/* ═══════════════════════════════════════
   CHART
═══════════════════════════════════════ */
function initChart(data) {
  const ctx = document.getElementById("performanceChart"); if (!ctx) return;
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.subjectsTaught || ["No subjects"],
      datasets: [{
        label: "Class Avg (%)",
        data: (data.subjectsTaught || []).map(() => Math.floor(Math.random() * 30) + 55),
        backgroundColor: "rgba(110,231,183,0.3)",
        borderColor: "#6ee7b7", borderWidth: 2, borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color:"#9ba3b8", font:{ family:"Plus Jakarta Sans" } } } },
      scales: {
        y: { min:40, max:100, ticks:{ color:"#9ba3b8" }, grid:{ color:"rgba(255,255,255,0.05)" } },
        x: { ticks:{ color:"#9ba3b8" }, grid:{ display:false } }
      }
    }
  });
}

/* ═══════════════════════════════════════
   PROFILE PHOTO
═══════════════════════════════════════ */
document.getElementById("profileUpload")?.addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  const user = auth.currentUser; if (!user) return;
  if (file.size > 5*1024*1024) { toast("Max 5MB.", "warning"); return; }
  const sEl = document.getElementById("uploadStatus");
  if (sEl) { sEl.style.display = "block"; sEl.style.color = "#9ba3b8"; sEl.textContent = "⏳ Uploading..."; }
  const task = uploadBytesResumable(ref(storage, `profileImages/${user.uid}`), file, { contentType:file.type });
  task.on("state_changed",
    s => { if (sEl) sEl.textContent = `⏳ ${Math.round(s.bytesTransferred/s.totalBytes*100)}%`; },
    err => { if (sEl) { sEl.textContent = "❌ " + err.message; sEl.style.color = "#ef4444"; } },
    async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      await setDoc(doc(db,"users",user.uid), { profileImage:url }, { merge:true });
      ["sbProfileImg","profilePreview","topbarImg"].forEach(id => {
        const el = document.getElementById(id); if (el) el.src = url;
      });
      if (sEl) sEl.textContent = "✅ Updated!";
      toast("Profile photo updated!", "success");
      setTimeout(() => { if (sEl) sEl.style.display = "none"; }, 3000);
    }
  );
});

/* ═══════════════════════════════════════
   SIGNATURE — electronic drawing pad
═══════════════════════════════════════ */
function loadSignaturePreview() {
  const card = document.getElementById("sigCard");
  if (teacherData?.teacherType !== "both") { if (card) card.style.display = "none"; return; }

  const savedWrap = document.getElementById("sigSavedWrap");
  const img       = document.getElementById("sigPreview");
  const rb        = document.getElementById("removeSigBtn");

  if (teacherData?.signature) {
    if (savedWrap) savedWrap.style.display = "block";
    if (img)       img.src = teacherData.signature;
    if (rb)        rb.style.display = "inline-block";
  } else {
    if (savedWrap) savedWrap.style.display = "none";
    if (rb)        rb.style.display = "none";
  }

  initSignaturePad();
}

function initSignaturePad() {
  const canvas = document.getElementById("sigCanvas");
  if (!canvas || canvas._padInit) return;
  canvas._padInit = true;

  // Set actual pixel dimensions matching display size
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }
  resizeCanvas();

  const ctx = canvas.getContext("2d");
  let drawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  }

  function doDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x; lastY = p.y;
  }

  function endDraw() { drawing = false; }

  canvas.addEventListener("mousedown",  startDraw);
  canvas.addEventListener("mousemove",  doDraw);
  canvas.addEventListener("mouseup",    endDraw);
  canvas.addEventListener("mouseleave", endDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove",  doDraw,    { passive: false });
  canvas.addEventListener("touchend",   endDraw);

  document.getElementById("clearSigBtn")?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
  });
}

document.getElementById("saveSigBtn")?.addEventListener("click", async () => {
  const canvas = document.getElementById("sigCanvas");
  const user   = auth.currentUser;
  if (!canvas || !user) return;

  // Check canvas isn't blank
  const ctx  = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const blank = !data.some(v => v !== 0);
  if (blank) { toast("Please draw your signature first.", "warning"); return; }

  const sEl = document.getElementById("sigUploadStatus");
  if (sEl) { sEl.style.display = "block"; sEl.style.color = "#9ba3b8"; sEl.textContent = "⏳ Saving..."; }

  try {
    // Export canvas as PNG blob — white background for clean PDF embed
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width  = canvas.width;
    exportCanvas.height = canvas.height;
    const ectx = exportCanvas.getContext("2d");
    ectx.fillStyle = "#ffffff";
    ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ectx.drawImage(canvas, 0, 0);

    const blob = await new Promise(res => exportCanvas.toBlob(res, "image/png"));
    const task = uploadBytesResumable(ref(storage, `signatures/${user.uid}`), blob, { contentType:"image/png" });

    task.on("state_changed",
      s => { if (sEl) sEl.textContent = `⏳ ${Math.round(s.bytesTransferred/s.totalBytes*100)}%`; },
      err => { if (sEl) { sEl.textContent = "❌ " + err.message; sEl.style.color = "#ef4444"; } },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await setDoc(doc(db,"users",user.uid), { signature:url }, { merge:true });
        teacherData.signature = url;
        loadSignaturePreview();
        if (sEl) { sEl.textContent = "✅ Signature saved!"; sEl.style.color = "#4ade80"; }
        toast("Signature saved!", "success");
        setTimeout(() => { if (sEl) sEl.style.display = "none"; }, 3000);
      }
    );
  } catch (err) { toast("Save failed: " + err.message, "error"); }
});

document.getElementById("removeSigBtn")?.addEventListener("click", async () => {
  if (!confirm("Remove signature?")) return;
  const user = auth.currentUser; if (!user) return;
  await setDoc(doc(db,"users",user.uid), { signature:"" }, { merge:true });
  teacherData.signature = "";
  // Clear the canvas too
  const canvas = document.getElementById("sigCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    canvas._padInit = false; // allow re-init
    initSignaturePad();
  }
  loadSignaturePreview();
  toast("Signature removed.", "info");
});

/* ═══════════════════════════════════════
   STUDENTS
═══════════════════════════════════════ */
async function loadStudents(filterClass = "") {
  if (!teacherData) return;
  const tbody = document.getElementById("studentsTbody"); if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="empty-msg">Loading...</td></tr>`;
  const classes = teacherData.classesTeaching || [];
  if (!classes.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-msg">No classes assigned.</td></tr>`; return; }
  try {
    const list = filterClass ? [filterClass] : classes;
    const snap = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","in",list)));
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4" class="empty-msg">No students found.</td></tr>`; return; }
    tbody.innerHTML = ""; let i = 1;
    snap.forEach(d => {
      const s = d.data();
      tbody.innerHTML += `<tr>
        <td data-label="#">${i++}</td>
        <td data-label="Name">${s.name||"--"}</td>
        <td data-label="Class">${s.studentClass||"--"}</td>
        <td data-label="Email">${s.email||"--"}</td>
      </tr>`;
    });
    const se = document.getElementById("statStudents"); if (se && !filterClass) se.textContent = snap.size;
  } catch (err) { tbody.innerHTML = `<tr><td colspan="4" class="empty-msg">Error: ${err.message}</td></tr>`; }
}
document.getElementById("studentsClassFilter")?.addEventListener("change", e => loadStudents(e.target.value));

/* ═══════════════════════════════════════
   CA CONFIGURATION
═══════════════════════════════════════ */
function caMax()  { return caConfig.reduce((a,b)=>a+b,0); }
function examMax(){ return 100 - caMax(); }

function renderCaConfig() {
  const tagList = document.getElementById("caTagList"); if (!tagList) return;
  const exam = examMax();

  // Each CA gets an editable number input so the teacher can adjust the split
  tagList.innerHTML = caConfig.map((v, i) =>
    `<label style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;
       background:rgba(110,231,183,0.12);border:1px solid rgba(110,231,183,0.25);
       border-radius:8px;font-size:12px;font-weight:600;color:var(--accent)">
      CA${i+1}:
      <input type="number" class="ca-cfg-inp" data-ci="${i}"
        value="${v}" min="1" max="${exam + v - 1}"
        style="width:40px;padding:2px 4px;background:transparent;border:none;
               border-bottom:1px solid var(--accent);color:var(--accent);
               font-family:var(--font);font-size:12px;font-weight:600;outline:none;text-align:center">
      ${caConfig.length > 1 ?
        `<button class="ca-remove-btn" data-ci="${i}"
          style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;
                 line-height:1;padding:0 2px" title="Remove CA${i+1}">✕</button>`
        : ''}
    </label>`
  ).join("") +
  `<span style="padding:4px 10px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.2);
     color:#60a5fa;border-radius:8px;font-size:12px;font-weight:600">
    Exam: ${exam}
  </span>`;

  const summary = document.getElementById("caScoreSummary");
  if (summary) summary.textContent = `CAs: ${caMax()} | Exam: ${exam} | Total: 100`;

  // Wire input changes
  tagList.querySelectorAll(".ca-cfg-inp").forEach(inp => {
    inp.addEventListener("change", () => {
      const i = parseInt(inp.dataset.ci);
      const newVal = parseInt(inp.value);
      if (isNaN(newVal) || newVal < 1) { inp.value = caConfig[i]; return; }
      // Make sure total CAs don't exceed 80 (leaving at least 20 for exam)
      const otherSum = caConfig.reduce((s, v, idx) => idx === i ? s : s + v, 0);
      if (otherSum + newVal > 80) {
        toast(`CAs can't total more than 80 (exam needs at least 20).`, "warning");
        inp.value = caConfig[i]; return;
      }
      caConfig[i] = newVal;
      renderCaConfig();
      rebuildScoresTable();
    });
  });

  // Wire remove buttons
  tagList.querySelectorAll(".ca-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.ci);
      caConfig.splice(i, 1);
      renderCaConfig();
      rebuildScoresTable();
    });
  });
}

document.getElementById("addCaBtn")?.addEventListener("click", () => {
  if (caConfig.length >= 4) { toast("Maximum 4 CAs allowed.", "warning"); return; }
  if (examMax() <= 20) { toast("Not enough room — reduce existing CA values first.", "warning"); return; }
  // Add new CA with 10 marks (taken from exam)
  caConfig.push(10);
  renderCaConfig();
  rebuildScoresTable();
});

/* ═══════════════════════════════════════
   ENTER SCORES — CA1 + CA2 + Exam + (Assign + Attend info)
═══════════════════════════════════════ */
let loadedScoresClass   = "";
let loadedScoresSubject = "";
let loadedScoresTerm    = "";
let loadedStudents      = []; // [{id, name}]

function rebuildScoresTable() {
  if (!loadedStudents.length) return;
  renderScoresTableHeader();
  renderScoresRows();
}

function renderScoresTableHeader() {
  const head = document.getElementById("scoresHead"); if (!head) return;
  const isClassTeacher = teacherData?.teacherType === "both";
  const caThs = caConfig.map((v, i) =>
    `<th>CA${i+1} <span style="font-weight:400;color:var(--text2)">(${v})</span></th>`
  ).join("");
  const exam = examMax();
  head.innerHTML = `<tr>
    <th>#</th><th>Student Name</th>
    ${caThs}
    <th>Exam <span style="font-weight:400;color:var(--text2)">(${exam})</span></th>
    <th>Total</th><th>Grade</th>
    <th title="Assignment score — informational only">Assign <span style="font-weight:400;font-size:10px;color:var(--text2)">(ℹ)</span></th>
    ${isClassTeacher ? `<th title="Attendance this term — informational only">Attend <span style="font-weight:400;font-size:10px;color:var(--text2)">(ℹ)</span></th>` : ""}
    <th>Save</th>
  </tr>`;
}

async function renderScoresRows() {
  const tbody = document.getElementById("scoresTbody"); if (!tbody) return;
  const cls = loadedScoresClass, subject = loadedScoresSubject, term = loadedScoresTerm;
  // Declare isClassTeacher BEFORE first use (was causing ReferenceError crash)
  const isClassTeacher = teacherData?.teacherType === "both";
  tbody.innerHTML = `<tr><td colspan="${4 + caConfig.length + (isClassTeacher ? 4 : 3)}" class="empty-msg">Loading saved scores...</td></tr>`;

  // Pre-load existing saved scores
  const scoreMap = {};
  try {
    for (const st of loadedStudents) {
      const docId = `${st.id}_${cls}_${subject}_${term.replace(/ /g,"")}`;
      const snap  = await getDoc(doc(db,"scores",docId));
      if (snap.exists()) scoreMap[st.id] = snap.data();
    }
  } catch {}

  // Pre-load class attendance per student (class teachers only — informational)
  const attendMap = {};
  if (isClassTeacher) {
    try {
      const attSnap = await getDocs(query(collection(db,"attendance"), where("school","==",teacherData.school), where("class","==",cls)));
      loadedStudents.forEach(st => {
        let present = 0, total = 0;
        attSnap.forEach(d => {
          const rec = d.data().records || {};
          if (rec[st.id] !== undefined) { total++; if (rec[st.id] === "present") present++; }
        });
        attendMap[st.id] = { present, total };
      });
    } catch {}
  }

  // Pre-load assignment scores for this subject (sum of graded assignments)
  const assignMap = {};
  try {
    const asnSnap = await getDocs(query(collection(db,"assignments"),
      where("class","==",cls), where("subject","==",subject)));
    for (const ad of asnSnap.docs) {
      const subsSnap = await getDocs(query(collection(db,"assignmentSubmissions"),
        where("assignmentId","==",ad.id)));
      subsSnap.forEach(sd => {
        const s = sd.data();
        if (s.grade === undefined || s.grade === null) return;
        if (!assignMap[s.studentId]) assignMap[s.studentId] = { total:0, parts:[] };
        assignMap[s.studentId].total  += s.grade;
        assignMap[s.studentId].parts.push(s.grade);
      });
    }
  } catch {}

  tbody.innerHTML = "";
  loadedStudents.forEach((st, idx) => {
    const ex     = scoreMap[st.id] || {};
    const cas    = caConfig.map((_, i) => ex[`ca${i}`] ?? "");
    const exam   = ex.exam ?? "";
    const total  = ex.total ?? "--";
    const grade  = ex.grade ?? "--";
    const att    = attendMap[st.id];
    const attStr = att && att.total > 0 ? `${att.present}/${att.total}` : "--";
    const aData  = assignMap[st.id];
    const assignStr = aData && aData.parts.length > 0
      ? `<span title="${aData.parts.join('+')}=${aData.total}">${aData.parts.join('+')}=${aData.total}</span>`
      : "--";

    const caInputs = caConfig.map((v, i) =>
      `<td data-label="CA${i+1}">
        <input type="number" class="ca-inp" data-ci="${i}" min="0" max="${v}" value="${cas[i]}" placeholder="0" style="width:58px;padding:5px 7px;background:var(--bg3);border:1px solid var(--card-border);border-radius:7px;color:var(--text);font-family:var(--font);font-size:13px;outline:none">
      </td>`
    ).join("");

    const tr = document.createElement("tr");
    tr.setAttribute("data-uid", st.id);
    tr.innerHTML = `
      <td data-label="#">${idx+1}</td>
      <td data-label="Name" style="font-weight:600">${st.name}</td>
      ${caInputs}
      <td data-label="Exam">
        <input type="number" class="exam-inp" min="0" max="${examMax()}" value="${exam}" placeholder="0"
          style="width:58px;padding:5px 7px;background:var(--bg3);border:1px solid var(--card-border);border-radius:7px;color:var(--text);font-family:var(--font);font-size:13px;outline:none">
      </td>
      <td data-label="Total" class="total-cell" style="font-weight:700">${total}</td>
      <td data-label="Grade" class="grade-cell" style="font-weight:700;color:var(--accent)">${grade}</td>
      <td data-label="Assign" style="color:var(--text2);font-size:12px">${assignStr}</td>
      ${isClassTeacher ? `<td data-label="Attend" style="color:var(--text2);font-size:13px">${attStr}</td>` : ""}
      <td data-label="Save">
        <button class="save-score-btn" data-uid="${st.id}" data-name="${st.name}">Save</button>
      </td>`;

    tbody.appendChild(tr);

    // Live calculation
    const updateTotal = () => {
      let caSum = 0;
      tr.querySelectorAll(".ca-inp").forEach((inp, i) => {
        const v = Math.min(parseFloat(inp.value)||0, caConfig[i]);
        caSum += v;
      });
      const examVal = Math.min(parseFloat(tr.querySelector(".exam-inp").value)||0, examMax());
      const t = caSum + examVal;
      tr.querySelector(".total-cell").textContent = t;
      tr.querySelector(".grade-cell").textContent = getGrade(t);
    };
    tr.querySelectorAll(".ca-inp,.exam-inp").forEach(inp => inp.addEventListener("input", updateTotal));

    // Save row
    tr.querySelector(".save-score-btn").addEventListener("click", async () => {
      const btn = tr.querySelector(".save-score-btn");
      const caVals = [];
      let caSum = 0;
      let valid = true;
      tr.querySelectorAll(".ca-inp").forEach((inp, i) => {
        const v = parseFloat(inp.value);
        if (isNaN(v) || v < 0 || v > caConfig[i]) { valid = false; }
        caVals.push(isNaN(v) ? 0 : v);
        caSum += isNaN(v) ? 0 : v;
      });
      const examVal = parseFloat(tr.querySelector(".exam-inp").value);
      if (!valid) { toast("Check CA values — each must be within its max.", "warning"); return; }
      if (isNaN(examVal) || examVal < 0 || examVal > examMax()) {
        toast(`Exam must be 0–${examMax()}.`, "warning"); return;
      }

      const total = caSum + examVal;
      const grade = getGrade(total);
      btn.textContent = "⏳"; btn.disabled = true;

      // Build score object with named CAs
      const scoreData = {
        studentId: st.id, studentName: st.name,
        class: cls, subject, term,
        exam: examVal, total, grade,
        teacherId: teacherData._uid, teacherName: teacherData.name,
        status: "saved", savedAt: serverTimestamp(),
        caConfig: [...caConfig]
      };
      caVals.forEach((v, i) => { scoreData[`ca${i}`] = v; });

      try {
        const docId = `${st.id}_${cls}_${subject}_${term.replace(/ /g,"")}`;
        await setDoc(doc(db,"scores",docId), scoreData);
        tr.querySelector(".total-cell").textContent = total;
        tr.querySelector(".grade-cell").textContent = grade;
        btn.textContent = "✅";
        toast(`${st.name} saved.`, "success");
      } catch (err) {
        btn.textContent = "❌";
        toast("Save failed: " + err.message, "error");
      } finally {
        setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 2500);
      }
    });
  });
}

document.getElementById("loadScoresBtn")?.addEventListener("click", async () => {
  const cls     = document.getElementById("scoresClassFilter").value;
  const subject = document.getElementById("scoresSubjectFilter").value;
  const term    = document.getElementById("scoresTermFilter").value;
  if (!cls || !subject) { toast("Select class and subject.", "warning"); return; }

  loadedScoresClass   = cls;
  loadedScoresSubject = subject;
  loadedScoresTerm    = term;
  loadedStudents      = [];

  const submitRow  = document.getElementById("submitScoresRow");
  const configRow  = document.getElementById("caConfigRow");
  const attendInfo = document.getElementById("termAttendInfo") || document.getElementById("attendTermSummary");

  // Load students
  try {
    const snap = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
    if (snap.empty) { toast(`No students in ${cls}.`, "warning"); return; }
    snap.forEach(d => loadedStudents.push({ id: d.id, name: d.data().name || "--" }));
  } catch (err) { toast("Load failed: " + err.message, "error"); return; }

  if (configRow) configRow.style.display = "block";
  if (submitRow) submitRow.style.display = "block";

  // Reset CA config to default
  caConfig = [20, 20];
  renderCaConfig();
  renderScoresTableHeader();
  await renderScoresRows();
});

/* ═══════════════════════════════════════
   SUBMIT RESULTS — review then submit to class teacher
═══════════════════════════════════════ */
function syncSubmitDropdowns() {
  // Mirror whatever is selected in Enter Scores if already loaded
  if (loadedScoresClass && loadedScoresSubject) {
    const cf = document.getElementById("submitClassFilter");
    const sf = document.getElementById("submitSubjectFilter");
    const tf = document.getElementById("submitTermFilter");
    if (cf) cf.value = loadedScoresClass;
    if (sf) sf.value = loadedScoresSubject;
    if (tf) tf.value = loadedScoresTerm;
  }
}

document.getElementById("loadSubmitBtn")?.addEventListener("click", async () => {
  const cls     = document.getElementById("submitClassFilter").value;
  const subject = document.getElementById("submitSubjectFilter").value;
  const term    = document.getElementById("submitTermFilter").value;
  const preview = document.getElementById("submitPreviewContainer");
  const actions = document.getElementById("submitActionsRow");
  if (!cls || !subject) { toast("Select class and subject.", "warning"); return; }

  preview.innerHTML = `<p class="empty-msg">Loading saved scores...</p>`;
  if (actions) actions.style.display = "none";

  try {
    const studSnap = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
    if (studSnap.empty) { preview.innerHTML = `<p class="empty-msg">No students in ${cls}.</p>`; return; }

    const rows = [];
    let cfg = [20, 20];
    for (const d of studSnap.docs) {
      const docId = `${d.id}_${cls}_${subject}_${term.replace(/ /g,"")}`;
      const snap  = await getDoc(doc(db,"scores",docId));
      if (snap.exists()) {
        const sc = snap.data();
        if (sc.caConfig) cfg = sc.caConfig;
        rows.push({ name: d.data().name||"--", ...sc });
      }
    }

    if (!rows.length) {
      preview.innerHTML = `<p class="empty-msg">No saved scores found for ${subject} – ${cls} – ${term}. Go to Enter Scores and save first.</p>`;
      return;
    }

    // Build preview table
    const caThs = cfg.map((v,i) => `<th>CA${i+1}(${v})</th>`).join("");
    const examH = 100 - cfg.reduce((a,b) => a+b, 0);
    let html = `
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">
        Showing <strong style="color:var(--text)">${rows.length}</strong> saved records for <strong style="color:var(--text)">${subject}</strong> – ${cls} – ${term}
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Student</th>${caThs}<th>Exam(${examH})</th><th>Total</th><th>Grade</th></tr></thead>
          <tbody>`;
    rows.forEach((r, i) => {
      const cas = cfg.map((_,ci) => r[`ca${ci}`] ?? "--").join("</td><td>");
      html += `<tr>
        <td>${i+1}</td><td style="font-weight:600">${r.name}</td>
        <td>${cas}</td>
        <td>${r.exam}</td><td style="font-weight:700">${r.total}</td>
        <td style="color:var(--accent);font-weight:700">${r.grade}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    preview.innerHTML = html;
    if (actions) actions.style.display = "block";
  } catch (err) { preview.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
});

document.getElementById("submitToClassTeacherBtn")?.addEventListener("click", async () => {
  const cls     = document.getElementById("submitClassFilter").value;
  const subject = document.getElementById("submitSubjectFilter").value;
  const term    = document.getElementById("submitTermFilter").value;
  const statusEl = document.getElementById("submitResultStatus");
  const btn      = document.getElementById("submitToClassTeacherBtn");
  if (!cls || !subject) { toast("Select class and subject.", "warning"); return; }

  btn.disabled = true; btn.textContent = "Submitting...";
  if (statusEl) { statusEl.style.display = "block"; statusEl.style.color = "#9ba3b8"; statusEl.textContent = "Finding class teacher..."; }

  try {
    // Find class teacher
    let ctId = teacherData._uid, ctName = teacherData.name;
    if (!(teacherData.teacherType === "both" && teacherData.mainClass === cls)) {
      const ctSnap = await getDocs(query(collection(db,"users"),
        where("role","==","teacher"), where("teacherType","==","both"), where("mainClass","==",cls)));
      if (ctSnap.empty) {
        if (statusEl) { statusEl.textContent = `⚠️ No class teacher for ${cls}.`; statusEl.style.color = "#fb923c"; }
        btn.textContent = "📬 Submit"; btn.disabled = false; return;
      }
      ctId = ctSnap.docs[0].id; ctName = ctSnap.docs[0].data().name;
    }

    const subId = `${cls}_${subject}_${term.replace(/ /g,"")}_${teacherData._uid}`;
    await setDoc(doc(db,"scoreSubmissions",subId), {
      class: cls, subject, term,
      teacherId: teacherData._uid, teacherName: teacherData.name,
      classTeacherId: ctId, classTeacherName: ctName,
      caConfig: [...caConfig],
      status: "submitted", submittedAt: serverTimestamp()
    });

    // Mark scores as submitted
    const scSnap = await getDocs(query(collection(db,"scores"),
      where("class","==",cls), where("subject","==",subject),
      where("term","==",term), where("teacherId","==",teacherData._uid)));
    for (const sd of scSnap.docs)
      await setDoc(sd.ref, { status:"submitted" }, { merge:true });

    // Notify class teacher (only if different)
    if (ctId !== teacherData._uid) {
      await addDoc(collection(db,"notifications"), {
        userId: ctId, type: "result",
        message: `📊 ${teacherData.name} submitted ${subject} scores for ${cls} (${term})`,
        read: false, createdAt: serverTimestamp()
      });
    }

    // Notify each student that their result is available
    try {
      const studSnap = await getDocs(query(collection(db,"users"),
        where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
      await Promise.all(studSnap.docs.map(sd =>
        addDoc(collection(db,"notifications"), {
          userId: sd.id, type: "result",
          message: `📊 Your ${subject} result for ${term} has been submitted by ${teacherData.name}.`,
          read: false, createdAt: serverTimestamp()
        })
      ));
    } catch {}

    const msg = ctId === teacherData._uid
      ? "✅ Scores added to your collation board!"
      : `✅ Submitted to ${ctName}!`;
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = "#4ade80"; }
    toast(msg, "success"); btn.textContent = "✅ Submitted!";
  } catch (err) {
    if (statusEl) { statusEl.textContent = "❌ " + err.message; statusEl.style.color = "#ef4444"; }
    btn.textContent = "📬 Submit"; btn.disabled = false;
    toast("Failed: " + err.message, "error");
  }
});

/* ═══════════════════════════════════════
   COLLATE RESULTS — grouped by student (Fix #6)
   Shows: Subject | CA cols | Exam | Total | Grade
   Plus attendance and assignment info per student
═══════════════════════════════════════ */
document.getElementById("loadCollateBtn")?.addEventListener("click", async () => {
  const term      = document.getElementById("collateTermFilter").value;
  const container = document.getElementById("collateContainer");
  if (!teacherData?.mainClass) {
    container.innerHTML = `<p class="empty-msg">No main class assigned to your account.</p>`; return;
  }
  const cls = teacherData.mainClass;
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;

  try {
    // Load all students in class
    const studSnap = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
    if (studSnap.empty) { container.innerHTML = `<p class="empty-msg">No students in ${cls}.</p>`; return; }

    // Load all score submissions tracking (for "submitted" badge)
    const subSnap = await getDocs(query(collection(db,"scoreSubmissions"),
      where("class","==",cls), where("term","==",term)));

    // Load all scores
    const scoresSnap = await getDocs(query(collection(db,"scores"),
      where("class","==",cls), where("term","==",term)));

    // Load attendance summary (class roll — official only)
    const attSnap = await getDocs(query(collection(db,"attendance"), where("school","==",teacherData.school), where("class","==",cls)));

    // Build score index: [studentId][subject] = scoreDoc
    const scoreIndex = {};
    const subjectSet = new Set();
    const caConfigMap = {};
    scoresSnap.forEach(d => {
      const s = d.data();
      if (!scoreIndex[s.studentId]) scoreIndex[s.studentId] = {};
      scoreIndex[s.studentId][s.subject] = s;
      subjectSet.add(s.subject);
      if (s.caConfig) caConfigMap[s.subject] = s.caConfig;
    });

    // "Submitted" means either: a scoreSubmissions doc exists, OR the score doc has status=="submitted"
    // This handles scores saved before the submission system was added.
    const submittedSubjects = new Set();
    subSnap.forEach(d => submittedSubjects.add(d.data().subject));
    scoresSnap.forEach(d => {
      const s = d.data();
      if (s.status === "submitted") submittedSubjects.add(s.subject);
    });

    // Build class attendance index: [studentId] = {present, total}
    const attIndex = {};
    studSnap.forEach(d => { attIndex[d.id] = { present:0, total:0 }; });
    attSnap.forEach(d => {
      const rec = d.data().records || {};
      Object.keys(attIndex).forEach(uid => {
        if (rec[uid] !== undefined) {
          attIndex[uid].total++;
          if (rec[uid] === "present") attIndex[uid].present++;
        }
      });
    });

    // Build assignment totals index: [studentId][subject] = { total, count }
    // Sum of all graded assignment scores per subject (e.g. 15+10+5 = 30 for Maths)
    const assignBySubject = {};
    studSnap.forEach(d => { assignBySubject[d.id] = {}; });

    // Load all assignments for this class, then their submissions
    const allAssignSnap = await getDocs(query(collection(db,"assignments"), where("school","==",teacherData.school), where("class","==",cls)));
    for (const ad of allAssignSnap.docs) {
      const a = ad.data();
      const subj = a.subject;
      if (!subj) continue;
      const subsSnap = await getDocs(query(collection(db,"assignmentSubmissions"),
        where("assignmentId","==",ad.id)));
      subsSnap.forEach(sd => {
        const s = sd.data();
        const g = s.grade;
        if (g === undefined || g === null) return;
        const uid = s.studentId;
        if (!assignBySubject[uid]) assignBySubject[uid] = {};
        if (!assignBySubject[uid][subj]) assignBySubject[uid][subj] = { total:0, count:0, parts:[] };
        assignBySubject[uid][subj].total += g;
        assignBySubject[uid][subj].count++;
        assignBySubject[uid][subj].parts.push(g);
      });
    }

    const subjects = [...subjectSet].sort();

    if (!subjects.length) {
      container.innerHTML = `<p class="empty-msg">No scores found for ${cls} – ${term}.</p>`;
      return;
    }

    container.innerHTML = "";

    // infoBar — submittedSubjects already built above, don't re-declare
    const infoBar = document.createElement("div");
    infoBar.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;padding:12px 16px;background:var(--bg3);border-radius:10px;font-size:13px;color:var(--text2)";
    infoBar.innerHTML = `<span>📚 <strong style="color:var(--text)">${subjects.length}</strong> subjects with scores</span>
      <span>✅ <strong style="color:var(--accent)">${submittedSubjects.size}</strong> submitted</span>
      <span>👨‍🎓 <strong style="color:var(--text)">${studSnap.size}</strong> students</span>`;
    container.appendChild(infoBar);

    // One card per student
    studSnap.forEach(d => {
      const uid  = d.id;
      const name = d.data().name || "--";
      const studentScores = scoreIndex[uid] || {};
      const att    = attIndex[uid];
      const attStr = att && att.total > 0 ? `${att.present}/${att.total} days` : "No record";

      const card = document.createElement("div");
      card.style.cssText = "background:var(--bg3);border:1px solid var(--card-border);border-radius:12px;padding:16px 18px;margin-bottom:16px";

      // Student header — just name, class, attendance
      const sHeader = document.createElement("div");
      sHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--card-border)";
      sHeader.innerHTML = `
        <div>
          <p style="font-size:15px;font-weight:700;color:var(--text)">${name}</p>
          <p style="font-size:12px;color:var(--text2);margin-top:2px">${cls} • ${term}</p>
        </div>
        <span style="font-size:12px;color:var(--text2)">🏫 Class Attend: <strong style="color:var(--text)">${attStr}</strong></span>`;
      card.appendChild(sHeader);

      if (!subjects.length) {
        card.innerHTML += `<p class="empty-msg" style="margin:0">No scores yet.</p>`;
      } else {
        const table = document.createElement("table");
        table.className = "data-table";
        table.style.fontSize = "13px";

        const sampleCfg = Object.values(caConfigMap)[0] || [20, 20];
        const caThs = sampleCfg.map((v, i) => `<th>CA${i+1}(${v})</th>`).join("");
        const examV = 100 - sampleCfg.reduce((a,b)=>a+b,0);
        table.innerHTML = `<thead><tr>
          <th>Subject</th>${caThs}<th>Exam(${examV})</th><th>Total</th><th>Grade</th>
          <th style="color:var(--text2);font-size:11px" title="Sum of graded assignment scores for this subject">Assign Scores</th>
          <th style="color:var(--text2);font-size:11px">Submitted</th>
        </tr></thead>`;

        const tbody = document.createElement("tbody");
        let grandTotal = 0, subjCount = 0;

        subjects.forEach(subj => {
          const sc = studentScores[subj];
          const subCfg = caConfigMap[subj] || sampleCfg;
          const tr = document.createElement("tr");

          // Assignment total for this student + subject
          const aData = (assignBySubject[uid] || {})[subj];
          const assignStr = aData && aData.count > 0
            ? `<span title="${aData.parts.join('+')}=${aData.total}" style="cursor:default">${aData.parts.join('+')}=${aData.total}</span>`
            : `<span style="color:var(--text2)">—</span>`;

          if (sc) {
            const cas = subCfg.map((_,i) => `<td>${sc[`ca${i}`]??"-"}</td>`).join("");
            const isSubmitted = submittedSubjects.has(subj);
            tr.innerHTML = `<td style="font-weight:600">${subj}</td>${cas}
              <td>${sc.exam}</td>
              <td style="font-weight:700">${sc.total}</td>
              <td style="font-weight:700;color:var(--accent)">${sc.grade}</td>
              <td style="font-size:12px;color:var(--text2)">${assignStr}</td>
              <td>${isSubmitted ? '<span style="color:#4ade80;font-size:11px">✅</span>' : '<span style="color:#fb923c;font-size:11px">⏳</span>'}</td>`;
            grandTotal += sc.total; subjCount++;
          } else {
            const emptyCols = subCfg.map(() => "<td style='color:var(--text2)'>--</td>").join("");
            tr.innerHTML = `<td style="font-weight:600;color:var(--text2)">${subj}</td>${emptyCols}
              <td style="color:var(--text2)">--</td><td>--</td><td>--</td>
              <td style="font-size:12px;color:var(--text2)">${assignStr}</td>
              <td style="color:var(--text2);font-size:11px">No score</td>`;
          }
          tbody.appendChild(tr);
        });

        if (subjCount > 0) {
          const avg = (grandTotal / subjCount).toFixed(1);
          const totalTr = document.createElement("tr");
          totalTr.style.cssText = "background:var(--bg2);font-weight:700";
          totalTr.innerHTML = `<td>AVERAGE</td>
            ${Array(sampleCfg.length + 2).fill('<td></td>').join("")}
            <td style="color:var(--accent)">${avg}%</td><td></td><td></td>`;
          tbody.appendChild(totalTr);
        }

        table.appendChild(tbody);
        card.appendChild(table);
      }

      container.appendChild(card);
    });

  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
});

/* ═══════════════════════════════════════
   REPORT CARDS — preview before download (Fix #7)
═══════════════════════════════════════ */
const REMARKS = [
  "Excellent performance! Keep up the great work.",
  "A very good effort this term. Aim higher next term.",
  "Satisfactory performance. More effort is needed.",
  "A hardworking student with great potential.",
  "Needs to improve focus and study habits.",
  "Good student — consistency will take you far.",
  "Shows improvement from last term. Keep it up!",
  "Outstanding results! You are a model student.",
  "Must put in more effort, especially in weak subjects.",
  "A promising student. Stay dedicated and disciplined."
];

let previewData = null; // { uid, name, term, subjects, avg, position, attStr, assignBySubj, ... }
const reportPreviewModal = document.getElementById("reportPreviewModal");
const remarkChips        = document.getElementById("remarkChips");

function buildRemarkChips() {
  if (!remarkChips) return;
  remarkChips.innerHTML = "";
  REMARKS.forEach(r => {
    const c = document.createElement("button"); c.className = "remark-chip"; c.textContent = r;
    c.addEventListener("click", () => {
      const rt = document.getElementById("remarkText"); if (rt) rt.value = r;
    });
    remarkChips.appendChild(c);
  });
}

document.getElementById("loadReportStudentsBtn")?.addEventListener("click", loadReportStudentList);

async function loadReportStudentList() {
  const term      = document.getElementById("reportTermFilter")?.value;
  const container = document.getElementById("reportCardsContainer"); if (!container) return;
  if (!teacherData?.mainClass) { container.innerHTML = `<p class="empty-msg">No main class assigned.</p>`; return; }
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;

  try {
    const cls = teacherData.mainClass;
    const [studSnap, savedSnap] = await Promise.all([
      getDocs(query(collection(db,"users"), where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls))),
      getDocs(query(collection(db,"savedReportCards"), where("school","==",teacherData.school), where("class","==",cls), where("term","==",term)))
    ]);
    if (studSnap.empty) { container.innerHTML = `<p class="empty-msg">No students in ${cls}.</p>`; return; }

    const savedMap = {};
    savedSnap.forEach(d => { savedMap[d.data().studentId] = d.data(); });

    container.innerHTML = "";
    studSnap.forEach(d => {
      const s    = d.data();
      const saved = savedMap[d.id];
      const has   = !!saved;
      const released = saved?.released === true;

      const card = document.createElement("div"); card.className = "report-student-card";
      card.innerHTML = `
        <div>
          <p class="report-student-name">${s.name||"--"}</p>
          <p class="report-student-class">${s.studentClass||""} • ${term}</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${!has ? "" : released
            ? `<span class="sub-status submitted" style="font-size:11px">✅ Sent to student</span>`
            : `<span class="sub-status" style="font-size:11px;background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);padding:3px 8px;border-radius:20px">📄 Generated — not sent</span>`
          }
          <button class="action-btn preview-btn" data-uid="${d.id}" data-name="${s.name||""}" style="font-size:12px">
            ${has ? "👁 Preview / Re-generate" : "📄 Preview & Generate"}
          </button>
          ${has && !released ? `
            <button class="send-report-btn action-btn" data-uid="${d.id}" data-name="${s.name||""}"
              style="font-size:12px;background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3)">
              📤 Send to ${s.name?.split(" ")[0]||"Student"}
            </button>` : ""}
        </div>`;
      container.appendChild(card);

      card.querySelector(".preview-btn").addEventListener("click", () =>
        openReportPreview(d.id, s.name||"", term, saved));

      card.querySelector(".send-report-btn")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const studentName = btn.dataset.name;
        const studentUid  = btn.dataset.uid;
        btn.textContent = "Sending..."; btn.disabled = true;
        try {
          const docId = `${studentUid}_${cls}_${term.replace(/ /g,"")}`;
          await setDoc(doc(db,"savedReportCards",docId), { released: true }, { merge:true });
          await addDoc(collection(db,"notifications"), {
            userId: studentUid, type:"result",
            message: `📄 Your ${term} report card is ready! Check your Report Cards section.`,
            read: false, createdAt: serverTimestamp()
          });
          toast(`Report card sent to ${studentName}!`, "success");
          loadReportStudentList();
        } catch (err) { toast("Failed: " + err.message, "error"); btn.textContent = `📤 Send to ${studentName.split(" ")[0]}`; btn.disabled = false; }
      });
    });
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
}

async function openReportPreview(uid, name, term, savedData) {
  const cls = teacherData.mainClass;
  const modal = document.getElementById("reportPreviewModal");
  if (!modal) return;

  // Show loading state
  const titleEl = document.getElementById("previewModalTitle");
  if (titleEl) titleEl.textContent = `Preview: ${name}`;
  modal.classList.add("open");

  const infoEl   = document.getElementById("previewStudentInfo");
  const tbody    = document.getElementById("previewScoresTbody");
  const extrasEl = document.getElementById("previewExtrasRow");
  const remarkEl = document.getElementById("remarkText");

  if (infoEl)   infoEl.innerHTML   = `<p style="color:var(--text2)">Loading scores...</p>`;
  if (tbody)    tbody.innerHTML    = "";
  if (extrasEl) extrasEl.innerHTML = "";

  // Pre-fill remark if already saved
  if (remarkEl && savedData?.remark) remarkEl.value = savedData.remark;

  buildRemarkChips();

  try {
    // Load scores
    const scSnap = await getDocs(query(collection(db,"scores"),
      where("studentId","==",uid), where("class","==",cls), where("term","==",term)));

    const subjects = [];
    let grandTotal = 0;
    let sampleCfg  = [20, 20];
    scSnap.forEach(d => {
      const sc = d.data();
      subjects.push(sc);
      grandTotal += sc.total;
      if (sc.caConfig) sampleCfg = sc.caConfig;
    });

    if (!subjects.length) {
      if (infoEl) infoEl.innerHTML = `<p style="color:#ef4444">No scores found for ${name} in ${term}. Make sure scores have been submitted first.</p>`;
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-msg">No scores found.</td></tr>`;
      previewData = null;
      return;
    }

    const avg = (grandTotal / subjects.length).toFixed(1);

    // Calculate position
    const allSnap = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
    const totals = [];
    for (const sd of allSnap.docs) {
      const sq = await getDocs(query(collection(db,"scores"),
        where("studentId","==",sd.id), where("class","==",cls), where("term","==",term)));
      let t = 0; sq.forEach(d => { t += d.data().total; }); totals.push({ id:sd.id, total:t });
    }
    totals.sort((a,b) => b.total - a.total);
    const pos     = totals.findIndex(s => s.id === uid) + 1;
    const ordinal = pos===1?"1st":pos===2?"2nd":pos===3?"3rd":`${pos}th`;

    // Load class attendance (official daily roll)
    const attSnap = await getDocs(query(collection(db,"attendance"), where("school","==",teacherData.school), where("class","==",cls)));
    let present = 0, total = 0;
    attSnap.forEach(d => {
      const rec = d.data().records || {};
      if (rec[uid] !== undefined) { total++; if (rec[uid]==="present") present++; }
    });
    const attStr = total > 0 ? `${present}/${total} days` : "No record";

    // Store for generation
    previewData = { uid, name, term, subjects, grandTotal, avg, position:pos,
      ordinal, totalStudents:allSnap.size, attStr, present, total,
      sampleCfg };

    // Fill school header
    const rpLogo = document.getElementById("rp-logo");
    const rpSchool = document.getElementById("rp-school");
    if (rpLogo)   rpLogo.textContent   = (teacherData.school||"S")[0].toUpperCase();
    if (rpSchool) rpSchool.textContent = teacherData.school || "SmartSchool";

    // Fill student info grid — 4 cells matching the PDF
    if (infoEl) infoEl.innerHTML = `
      <div class="rp-info-cell">
        <div class="rp-info-label">Student</div>
        <div class="rp-info-val">${name}</div>
      </div>
      <div class="rp-info-cell">
        <div class="rp-info-label">Class</div>
        <div class="rp-info-val">${cls}</div>
      </div>
      <div class="rp-info-cell">
        <div class="rp-info-label">Average</div>
        <div class="rp-info-val accent">${avg}%</div>
      </div>
      <div class="rp-info-cell">
        <div class="rp-info-label">Position</div>
        <div class="rp-info-val blue">${ordinal} / ${allSnap.size}</div>
      </div>`;

    // Fill scores table
    if (tbody) {
      const caHeadEl = document.getElementById("previewCaHead");
      if (caHeadEl) caHeadEl.textContent = sampleCfg.map((v,i)=>`CA${i+1}(${v})`).join("  ");
      tbody.innerHTML = "";
      subjects.forEach(sc => {
        const caSum = sampleCfg.reduce((s,_,i) => s + (sc[`ca${i}`]||0), 0);
        const caDetail = sampleCfg.map((v,i)=>`CA${i+1}=${sc[`ca${i}`]??"-"}`).join(", ");
        const gc = {A:"#4ade80",B:"#60a5fa",C:"#fbbf24",D:"#fb923c",E:"#f87171",F:"#ef4444"}[sc.grade]||"var(--text2)";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-weight:600">${sc.subject}</td>
          <td>${caSum} <span style="font-size:10px;color:var(--text2)">(${caDetail})</span></td>
          <td>${sc.exam}</td>
          <td style="font-weight:700">${sc.total}</td>
          <td style="font-weight:700;color:${gc}">${sc.grade}</td>`;
        tbody.appendChild(tr);
      });
      // Average row
      const avgTr = document.createElement("tr");
      avgTr.className = "rp-avg-row";
      avgTr.innerHTML = `<td style="font-weight:700">AVERAGE</td>
        <td colspan="2"></td>
        <td></td>
        <td style="color:var(--accent)">${avg}%</td>`;
      tbody.appendChild(avgTr);
    }

    // Extras — attendance + editable next term
    if (extrasEl) {
      extrasEl.innerHTML = `
        <div class="rp-extra-cell">
          <div class="rp-extra-label">🏫 Attendance</div>
          <div class="rp-extra-val">${attStr}</div>
        </div>
        <div class="rp-extra-cell">
          <div class="rp-extra-label">📅 Next Term Resumes</div>
          <input id="reportNextTerm" placeholder="e.g. 14th January, 2026"
            value="${savedData?.nextTerm || ''}">
        </div>`;
    }

  } catch (err) {
    if (infoEl) infoEl.innerHTML = `<p style="color:#ef4444">Error loading data: ${err.message}</p>`;
  }
}

document.getElementById("closePreviewModal")?.addEventListener("click", () => {
  reportPreviewModal?.classList.remove("open");
  previewData = null;
});
reportPreviewModal?.addEventListener("click", e => {
  if (e.target === reportPreviewModal) { reportPreviewModal.classList.remove("open"); previewData = null; }
});

document.getElementById("saveRemarkOnlyBtn")?.addEventListener("click", async () => {
  if (!previewData) return;
  const remark = document.getElementById("remarkText")?.value?.trim();
  if (!remark) { toast("Write a comment first.", "warning"); return; }
  const { uid, name, term } = previewData;
  const cls = teacherData.mainClass;
  const docId = `${uid}_${cls}_${term.replace(/ /g,"")}`;
  await setDoc(doc(db,"savedReportCards",docId), {
    studentId:uid, studentName:name, class:cls, term,
    teacherId:teacherData._uid, teacherName:teacherData.name,
    remark, generatedAt:serverTimestamp()
  }, { merge:true });
  toast("Comment saved!", "success");
  reportPreviewModal?.classList.remove("open");
  loadReportStudentList();
});

document.getElementById("confirmGenerateBtn")?.addEventListener("click", async () => {
  const remark = document.getElementById("remarkText")?.value?.trim();
  if (!remark) {
    document.getElementById("remarkText")?.focus();
    toast("Please write a comment before generating.", "warning");
    return;
  }
  if (!previewData) { toast("No preview data.", "warning"); return; }
  reportPreviewModal?.classList.remove("open");
  await generateReportCard(previewData, remark);
  loadReportStudentList();
});

async function generateReportCard(data, teacherRemark) {
  const { uid, name, term, subjects, grandTotal, avg, ordinal, totalStudents,
          attStr, present, total: totalDays } = data;
  const cls     = teacherData.mainClass;
  const nextTerm = document.getElementById("reportNextTerm")?.value || "To be announced";

  toast(`Generating report for ${name}...`, "info");

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    const W = 210, H = 297;
    let y = 15;

    // Header
    pdf.setFillColor(15,17,23); pdf.rect(0,0,W,40,"F");
    pdf.setFillColor(110,231,183); pdf.roundedRect(14,8,24,24,4,4,"F");
    pdf.setTextColor(15,17,23); pdf.setFontSize(16); pdf.setFont("helvetica","bold"); pdf.text("S",26,23,{align:"center"});
    pdf.setTextColor(255,255,255); pdf.setFontSize(16); pdf.setFont("helvetica","bold"); pdf.text(teacherData.school||"SmartSchool",45,17);
    pdf.setFontSize(9); pdf.setFont("helvetica","normal"); pdf.text("Student Academic Report Card",45,24); pdf.text(`${term} | ${new Date().getFullYear()}`,45,30);
    y = 50;

    // Student info bar
    pdf.setFillColor(245,247,250); pdf.roundedRect(14,y,W-28,28,3,3,"F");
    pdf.setTextColor(100,100,120); pdf.setFontSize(8); pdf.setFont("helvetica","bold");
    pdf.text("STUDENT NAME",20,y+8); pdf.text("CLASS",90,y+8); pdf.text("TERM",130,y+8); pdf.text("POSITION",168,y+8);
    pdf.setTextColor(20,20,40); pdf.setFontSize(11); pdf.setFont("helvetica","bold"); pdf.text(name,20,y+18);
    pdf.setFontSize(10); pdf.text(cls,90,y+18); pdf.text(term,130,y+18);
    pdf.setTextColor(59,130,246); pdf.text(`${ordinal} / ${totalStudents}`,168,y+18);
    y += 36;

    // Score table header
    const sampleCfg = data.sampleCfg || [20, 20];
    const examV = 100 - sampleCfg.reduce((a,b)=>a+b,0);
    pdf.setFillColor(15,17,23); pdf.rect(14,y,W-28,8,"F");
    pdf.setTextColor(255,255,255); pdf.setFontSize(8); pdf.setFont("helvetica","bold");
    pdf.text("SUBJECT",18,y+5.5);
    let xc = 90;
    sampleCfg.forEach((v,i) => { pdf.text(`CA${i+1}(${v})`,xc,y+5.5); xc += 20; });
    pdf.text(`EXAM(${examV})`,xc,y+5.5); xc += 22;
    pdf.text("TOTAL",xc,y+5.5); xc += 16;
    pdf.text("GRADE",xc,y+5.5);
    y += 8;

    subjects.forEach((sc, idx) => {
      if (idx%2===0) { pdf.setFillColor(248,249,252); pdf.rect(14,y,W-28,8,"F"); }
      pdf.setTextColor(20,20,40); pdf.setFontSize(9); pdf.setFont("helvetica","normal");
      pdf.text(sc.subject,18,y+5.5);
      let xr = 90;
      sampleCfg.forEach((_,i) => { pdf.text(String(sc[`ca${i}`]??"-"),xr,y+5.5); xr += 20; });
      pdf.text(String(sc.exam),xr,y+5.5); xr += 22;
      pdf.text(String(sc.total),xr,y+5.5); xr += 16;
      const gc={A:[74,222,128],B:[96,165,250],C:[251,191,36],D:[251,146,60],E:[248,113,113],F:[239,68,68]}[sc.grade]||[100,100,100];
      pdf.setTextColor(gc[0],gc[1],gc[2]); pdf.setFont("helvetica","bold"); pdf.text(sc.grade,xr,y+5.5);
      y += 8;
    });

    // Average row
    pdf.setFillColor(15,17,23); pdf.rect(14,y,W-28,8,"F");
    pdf.setTextColor(255,255,255); pdf.setFontSize(9); pdf.setFont("helvetica","bold");
    pdf.text("AVERAGE",18,y+5.5); pdf.text(`${avg}%`,190,y+5.5,{align:"right"});
    y += 14;

    // Attendance + Next Term row
    pdf.setFillColor(245,247,250); pdf.roundedRect(14,y,90,22,3,3,"F");
    pdf.setTextColor(100,100,120); pdf.setFontSize(7); pdf.setFont("helvetica","bold"); pdf.text("ATTENDANCE",20,y+7);
    pdf.setTextColor(20,20,40); pdf.setFontSize(10); pdf.setFont("helvetica","normal"); pdf.text(attStr,20,y+15);

    pdf.setFillColor(245,247,250); pdf.roundedRect(110,y,86,22,3,3,"F");
    pdf.setTextColor(100,100,120); pdf.setFontSize(7); pdf.setFont("helvetica","bold"); pdf.text("NEXT TERM RESUMES",116,y+7);
    pdf.setTextColor(20,20,40); pdf.setFontSize(9); pdf.setFont("helvetica","normal"); pdf.text(nextTerm,116,y+15);
    y += 28;

    // Teacher comment
    const lines = pdf.splitTextToSize(teacherRemark, W-48);
    const ch    = Math.max(22, lines.length*5+14);
    pdf.setFillColor(245,247,250); pdf.roundedRect(14,y,W-28,ch,3,3,"F");
    pdf.setTextColor(100,100,120); pdf.setFontSize(8); pdf.setFont("helvetica","bold"); pdf.text("CLASS TEACHER'S COMMENT",20,y+7);
    pdf.setTextColor(60,60,80); pdf.setFontSize(9); pdf.setFont("helvetica","italic"); pdf.text(lines,20,y+14);
    y += ch + 10;

    // Signatures — drawn electronically, stored as clean PNG
    async function embedSig(url, x, yp, mw, mh) {
      try {
        const res  = await fetch(url);
        const blob = await res.blob();
        const b64  = await new Promise(r => {
          const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob);
        });
        pdf.addImage(b64, "PNG", x, yp, mw, mh, undefined, "FAST");
      } catch {}
    }

    const ss   = await loadSchoolSettings();
    const tSig = teacherData?.signature || null;
    const pSig = ss?.principalSignature || null;
    const pTitle = ss?.principalTitle || "Principal";

    pdf.setFillColor(250,250,252); pdf.roundedRect(14,y,85,32,3,3,"F");
    if (tSig) await embedSig(tSig,18,y+2,77,20);
    pdf.setDrawColor(180,180,200); pdf.setLineWidth(0.3); pdf.line(18,y+25,90,y+25);
    pdf.setTextColor(100,100,120); pdf.setFontSize(8); pdf.setFont("helvetica","normal");
    pdf.text("Class Teacher's Signature",50,y+30,{align:"center"});

    pdf.setFillColor(250,250,252); pdf.roundedRect(104,y,92,32,3,3,"F");
    if (pSig) await embedSig(pSig,108,y+2,84,20);
    pdf.line(108,y+25,W-16,y+25);
    pdf.text(`${pTitle}'s Signature`,W-50,y+30,{align:"center"});
    y += 40;

    // Footer
    pdf.setFillColor(15,17,23); pdf.rect(0,H-12,W,12,"F");
    pdf.setTextColor(155,163,184); pdf.setFontSize(7);
    pdf.text(`Generated by SmartSchool • ${teacherData.school||""} • ${new Date().toLocaleDateString()}`,W/2,H-5,{align:"center"});

    // Save to Firestore — store report DATA only, not the PDF blob
    // PDF is always regenerated fresh on download (avoids stale/outdated PDFs)
    const docId = `${uid}_${cls}_${term.replace(/ /g,"")}`;
    await setDoc(doc(db,"savedReportCards",docId), {
      studentId:uid, studentName:name, class:cls, term,
      school:teacherData.school||"",
      teacherId:teacherData._uid, teacherName:teacherData.name,
      nextTerm, subjects, grandTotal, average:avg,
      position:data.position, totalStudents, present, totalDays,
      remark:teacherRemark, sampleCfg: data.sampleCfg || [20,20],
      released: false,
      generatedAt:serverTimestamp()
    }, { merge:true });

    // Notify admin that a report card was generated
    try {
      await addDoc(collection(db,"adminNotifications"), {
        school:    teacherData.school || "",
        icon:      "📄",
        message:   `Report card generated for ${name} (${cls} · ${term}) by ${teacherData.name}`,
        type:      "report_card",
        read:      false,
        createdAt: serverTimestamp()
      });
    } catch {}

    pdf.save(`${name.replace(/ /g,"_")}_ReportCard_${term.replace(/ /g,"_")}.pdf`);
    toast(`Report card for ${name} downloaded! Click "Send to ${name}" when ready to release.`, "success");
  } catch (err) { toast("PDF failed: " + err.message, "error"); console.error(err); }
}

async function loadSchoolSettings() {
  if (!teacherData?.school) return null;
  try {
    const slug = teacherData.school.toLowerCase().replace(/\s+/g,"_");
    const snap = await getDoc(doc(db,"schoolSettings",slug));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

/* ═══════════════════════════════════════
   ATTENDANCE — Class Roll only
   (Subject-only teachers don't see this section)
   Each class teacher writes to attendance/{class}_{date} — keyed by class,
   so different class teachers can never affect each other's records.
═══════════════════════════════════════ */
const attendDateEl = document.getElementById("attendDate");
if (attendDateEl) attendDateEl.value = new Date().toISOString().split("T")[0];

let classAttendMap = {};

document.getElementById("loadAttendBtn")?.addEventListener("click", async () => {
  const cls       = document.getElementById("attendClassFilter").value;
  const date      = document.getElementById("attendDate").value;
  const container = document.getElementById("attendanceContainer");
  const saveRow   = document.getElementById("attendSaveRow");
  const summary   = document.getElementById("attendTermSummary");
  if (!cls || !date) { toast("Select class and date.", "warning"); return; }
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  classAttendMap = {};

  try {
    // Session count for this class
    const allSnap = await getDocs(query(collection(db,"attendance"), where("school","==",teacherData.school), where("class","==",cls)));
    if (summary) {
      summary.style.display = "block";
      const sc = document.getElementById("termSessionCount");
      if (sc) sc.textContent = allSnap.size;
    }

    // Existing record for this date
    const existSnap = await getDocs(query(collection(db,"attendance"),
      where("class","==",cls), where("date","==",date)));
    const existing = existSnap.empty ? {} : (existSnap.docs[0].data().records || {});

    // Load students
    const studSnap = await getDocs(query(collection(db,"users"),
      where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
    if (studSnap.empty) { container.innerHTML = `<p class="empty-msg">No students in ${cls}.</p>`; return; }

    const table = document.createElement("table"); table.className = "data-table";
    table.innerHTML = `<thead><tr><th>#</th><th>Student</th><th>Today</th><th>Term Total</th></tr></thead>
      <tbody id="attendTbody"></tbody>`;
    container.innerHTML = ""; container.appendChild(table);
    const tbody = document.getElementById("attendTbody");
    let i = 1;

    studSnap.forEach(d => {
      const s      = d.data();
      const status = existing[d.id] || "present";
      classAttendMap[d.id] = status;

      let sPres = 0, sTotal = 0;
      allSnap.forEach(ad => {
        const rec = ad.data().records || {};
        if (rec[d.id] !== undefined) { sTotal++; if (rec[d.id] === "present") sPres++; }
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="#">${i++}</td>
        <td data-label="Student" style="font-weight:600">${s.name||"--"}</td>
        <td data-label="Today">
          <select class="attend-sel styled-select" data-uid="${d.id}" style="padding:5px 10px;font-size:12px;width:auto">
            <option value="present" ${status==="present"?"selected":""}>✅ Present</option>
            <option value="absent"  ${status==="absent" ?"selected":""}>❌ Absent</option>
          </select>
        </td>
        <td data-label="Term Total" style="font-size:13px">
          ${sTotal > 0 ? `<strong>${sPres}/${sTotal}</strong> <span style="color:var(--text2)">days</span>` : "—"}
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".attend-sel").forEach(sel =>
      sel.addEventListener("change", () => { classAttendMap[sel.dataset.uid] = sel.value; }));
    if (saveRow) saveRow.style.display = "block";
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
});

document.getElementById("saveAttendBtn")?.addEventListener("click", async () => {
  const cls  = document.getElementById("attendClassFilter").value;
  const date = document.getElementById("attendDate").value;
  const btn  = document.getElementById("saveAttendBtn");
  const stEl = document.getElementById("attendSaveStatus");
  if (!cls || !date || !Object.keys(classAttendMap).length) { toast("Load students first.", "warning"); return; }
  btn.textContent = "Saving..."; btn.disabled = true;
  try {
    // Doc ID is {class}_{date} — naturally isolated per class teacher, no cross-class interference
    await setDoc(doc(db, "attendance", `${cls}_${date}`), {
      class: cls, date, records: classAttendMap,
      teacherId: teacherData._uid, savedAt: serverTimestamp()
    });
    if (stEl) { stEl.textContent = "✅ Saved!"; stEl.style.color = "#4ade80"; }
    toast("Attendance saved!", "success");
    const allAtt = await getDocs(query(collection(db,"attendance"), where("school","==",teacherData.school), where("class","==",cls)));
    const sc = document.getElementById("termSessionCount"); if (sc) sc.textContent = allAtt.size;
  } catch (err) { toast("Failed: " + err.message, "error"); }
  finally { btn.textContent = "💾 Save Attendance"; btn.disabled = false; }
});

/* ═══════════════════════════════════════
   ASSIGNMENTS
═══════════════════════════════════════ */
const assignModal = document.getElementById("assignModal");
let editingAssignId = null;

function openAssignModal(existing = null) {
  editingAssignId = existing?.id || null;
  const titleEl    = document.getElementById("assignTitle");
  const subjectEl  = document.getElementById("assignSubject");
  const termEl     = document.getElementById("assignTerm");
  const maxEl      = document.getElementById("assignMaxScore");
  const dueEl      = document.getElementById("assignDue");
  const descEl     = document.getElementById("assignDesc");
  const heading    = assignModal.querySelector("h3");
  const saveBtn    = document.getElementById("saveAssignBtn");

  if (existing) {
    if (heading)   heading.textContent   = "Edit Assignment";
    if (saveBtn)   saveBtn.textContent   = "Save Changes";
    if (titleEl)   titleEl.value         = existing.title   || "";
    if (subjectEl) subjectEl.value       = existing.subject || "";
    if (termEl)    termEl.value          = existing.term    || "";
    if (maxEl)     maxEl.value           = existing.maxScore|| 100;
    if (dueEl)     dueEl.value           = existing.due     || "";
    if (descEl)    descEl.value          = existing.description || "";
    // Pre-check classes for existing assignment
    const existingClasses = existing.classes || (existing.class ? [existing.class] : []);
    document.querySelectorAll(".assign-class-chk").forEach(chk => {
      chk.checked = existingClasses.includes(chk.value);
    });
  } else {
    if (heading)   heading.textContent   = "Create Assignment";
    if (saveBtn)   saveBtn.textContent   = "Save";
    if (titleEl)   titleEl.value         = "";
    if (descEl)    descEl.value          = "";
    if (dueEl)     dueEl.value           = "";
    if (maxEl)     maxEl.value           = "100";
    if (termEl && !termEl.value) termEl.value = "1st Term";
    document.querySelectorAll(".assign-class-chk").forEach(chk => chk.checked = false);
    // Reset type to text and hide conditional sections
    const textRadio = document.querySelector("input[name='assignType'][value='text']");
    if (textRadio) textRadio.checked = true;
    assignMcqQuestions = [];
    renderAssignMcq();
  }
  const mcqSec  = document.getElementById("assignMcqSection");
  const fileSec = document.getElementById("assignFileSection");
  const selType = document.querySelector("input[name='assignType']:checked")?.value || "text";
  if (mcqSec)  mcqSec.style.display  = selType === "mcq"  ? "block" : "none";
  if (fileSec) fileSec.style.display = selType === "file" ? "block" : "none";
  assignModal?.classList.add("open");
}

document.getElementById("openAssignModal")?.addEventListener("click", () => openAssignModal());
document.getElementById("closeAssignModal")?.addEventListener("click", () => {
  assignModal?.classList.remove("open");
  editingAssignId = null;
});
assignModal?.addEventListener("click", e => {
  if (e.target === assignModal) { assignModal.classList.remove("open"); editingAssignId = null; }
});

document.querySelectorAll("#sec-assignments .tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#sec-assignments .tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll("#sec-assignments .tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
    if (btn.dataset.tab === "submissions") loadAllSubmissions();
  });
});

/* ── MCQ BUILDER for assignments ── */
let assignMcqQuestions = [];

function renderAssignMcq() {
  const container = document.getElementById("mcqQuestionsList");
  if (!container) return;
  container.innerHTML = "";
  assignMcqQuestions.forEach((q, qi) => {
    const card = document.createElement("div");
    card.className = "mcq-card";
    card.innerHTML = `
      <div class="mcq-card-header">
        <span class="mcq-qnum">Q${qi + 1}</span>
        <button class="remove-q-btn" data-qi="${qi}">✕ Remove</button>
      </div>
      <input class="mcq-question-input" placeholder="Enter question..." value="${q.question || ""}" data-qi="${qi}" data-field="question">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-weight:600">Options — select the correct answer:</div>
      ${["A","B","C","D"].map((opt, oi) => `
        <div class="mcq-option-row">
          <input type="radio" name="q${qi}_correct" value="${oi}" ${q.correct === oi ? "checked" : ""} data-qi="${qi}" data-oi="${oi}" class="mcq-correct-radio">
          <input type="text" placeholder="Option ${opt}" value="${q.options[oi] || ""}" data-qi="${qi}" data-oi="${oi}" class="mcq-option-input">
        </div>`).join("")}
      <div style="font-size:11px;color:#4ade80;margin-top:6px">✅ Select the radio button next to the correct answer</div>`;
    container.appendChild(card);
    card.querySelector(".remove-q-btn").addEventListener("click", () => {
      assignMcqQuestions.splice(qi, 1); renderAssignMcq();
    });
    card.querySelectorAll(".mcq-question-input").forEach(inp => {
      inp.addEventListener("input", e => { assignMcqQuestions[qi].question = e.target.value; });
    });
    card.querySelectorAll(".mcq-option-input").forEach(inp => {
      inp.addEventListener("input", e => {
        assignMcqQuestions[qi].options[parseInt(e.target.dataset.oi)] = e.target.value;
      });
    });
    card.querySelectorAll(".mcq-correct-radio").forEach(radio => {
      radio.addEventListener("change", e => {
        assignMcqQuestions[qi].correct = parseInt(e.target.value);
      });
    });
  });
}

document.getElementById("addMcqQuestion")?.addEventListener("click", () => {
  assignMcqQuestions.push({ question: "", options: ["","","",""], correct: 0 });
  renderAssignMcq();
});

document.querySelectorAll("input[name='assignType']").forEach(r => {
  r.addEventListener("change", e => {
    const val     = e.target.value;
    const mcqSec  = document.getElementById("assignMcqSection");
    const fileSec = document.getElementById("assignFileSection");
    if (mcqSec)  mcqSec.style.display  = val === "mcq"  ? "block" : "none";
    if (fileSec) fileSec.style.display = val === "file" ? "block" : "none";
  });
});

document.getElementById("saveAssignBtn")?.addEventListener("click", async () => {
  const title    = (document.getElementById("assignTitle")?.value    || "").trim();
  const selectedClasses = [...document.querySelectorAll(".assign-class-chk:checked")].map(c => c.value);
  const subject  =  document.getElementById("assignSubject")?.value  || "";
  const term     =  document.getElementById("assignTerm")?.value     || "";
  const due      =  document.getElementById("assignDue")?.value      || "";
  const desc     = (document.getElementById("assignDesc")?.value     || "").trim();
  const maxScore =  parseInt(document.getElementById("assignMaxScore")?.value) || 100;
  const assignType = document.querySelector("input[name='assignType']:checked")?.value || "text";
  if (!title || !selectedClasses.length || !subject || !term) { toast("Fill all required fields and select at least one class.", "warning"); return; }

  // Validate MCQ
  if (assignType === "mcq") {
    if (assignMcqQuestions.length === 0) { toast("Add at least one question.", "warning"); return; }
    const incomplete = assignMcqQuestions.some(q => !q.question.trim() || q.options.filter(o => o.trim()).length < 2);
    if (incomplete) { toast("Each question needs text and at least 2 options.", "warning"); return; }
  }

  const btn = document.getElementById("saveAssignBtn");
  btn.textContent = "Saving..."; btn.disabled = true;

  try {
    // Upload teacher attachment if any
    let attachmentUrl = null;
    const fileInput = document.getElementById("assignFile");
    if (fileInput?.files?.[0]) {
      const file = fileInput.files[0];
      const statusEl = document.getElementById("assignFileStatus");
      if (statusEl) { statusEl.textContent = "⏳ Uploading attachment..."; statusEl.style.display = "block"; }
      const storRef = ref(storage, `assignments/${teacherData.schoolSlug}/${Date.now()}_${file.name}`);
      const snap = await new Promise((res, rej) => {
        const task = uploadBytesResumable(storRef, file);
        task.on("state_changed", null, rej, () => res(task.snapshot));
      });
      attachmentUrl = await getDownloadURL(snap.ref);
      if (statusEl) statusEl.style.display = "none";
    }

    const baseData = {
      title, subject, term, due: due || null, description: desc, maxScore,
      teacherId: teacherData._uid, teacherName: teacherData.name,
      school: teacherData.school || "", closed: false,
      assignType, createdAt: serverTimestamp(),
      ...(attachmentUrl ? { attachmentUrl } : {}),
      ...(assignType === "mcq" ? { questions: assignMcqQuestions } : {})
    };

    if (editingAssignId) {
      await setDoc(doc(db, "assignments", editingAssignId), baseData, { merge: true });
      toast("Assignment updated!", "success");
    } else {
      await Promise.all(selectedClasses.map(cls =>
        addDoc(collection(db, "assignments"), { ...baseData, class: cls, classes: selectedClasses })
      ));
      try {
        await Promise.all(selectedClasses.map(async cls => {
          const studSnap = await getDocs(query(collection(db, "users"),
            where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
          return Promise.all(studSnap.docs.map(sd =>
            addDoc(collection(db, "notifications"), {
              userId: sd.id, type: "assignment",
              message: `📌 New ${assignType === "mcq" ? "objective " : ""}assignment: "${title}" for ${subject} (${term})${due ? ` — due ${due.split("T")[0]}` : ""}`,
              read: false, createdAt: serverTimestamp()
            })
          ));
        }));
      } catch {}
      toast(`Assignment created for ${selectedClasses.join(", ")}!`, "success");
    }
    assignModal.classList.remove("open");
    editingAssignId = null;
    assignMcqQuestions = [];
    loadAssignments();
  } catch (err) { toast("Failed: " + err.message, "error"); }
  finally { btn.textContent = editingAssignId ? "Save Changes" : "Save"; btn.disabled = false; }
});

async function loadAssignments() {
  if (!teacherData) return;
  const container = document.getElementById("assignmentsList"); if (!container) return;
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  try {
    const snap = await getDocs(query(collection(db,"assignments"), where("teacherId","==",teacherData._uid)));
    if (snap.empty) {
      container.innerHTML = `<p class="empty-msg">No assignments yet.</p>`;
      const ae = document.getElementById("statAssignments"); if (ae) ae.textContent = "0"; return;
    }
    const ae = document.getElementById("statAssignments"); if (ae) ae.textContent = snap.size;
    const groups = { "1st Term":[], "2nd Term":[], "3rd Term":[], "Other":[] };
    snap.forEach(d => {
      const a = { id:d.id, ...d.data() };
      (groups[a.term] || groups["Other"]).push(a);
    });
    container.innerHTML = "";
    for (const [term, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const group = document.createElement("div"); group.className = "assign-term-group";
      group.innerHTML = `
        <div class="assign-term-header">
          <span>📅 ${term}</span>
          <span class="term-count">${list.length} assignment${list.length>1?"s":""}</span>
          <span class="term-chevron">▼</span>
        </div>
        <div class="assign-term-body"></div>`;
      group.querySelector(".assign-term-header").addEventListener("click",
        () => group.classList.toggle("collapsed"));
      const body = group.querySelector(".assign-term-body");
      list.forEach(a => body.appendChild(buildAssignCard(a)));
      container.appendChild(group);
    }
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
}

function buildAssignCard(a) {
  const now = new Date(), due = a.due ? new Date(a.due) : null, overdue = due && due < now;
  const dueLabel = !due ? "No deadline"
    : overdue ? `⚠️ Overdue (${a.due.split("T")[0]})`
    : `📅 Due: ${a.due.split("T")[0]}`;

  const card = document.createElement("div"); card.className = "assign-card";
  card.innerHTML = `
    <div style="cursor:pointer;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap" class="acard-hdr">
      <div style="flex:1;min-width:0">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:4px">${a.title}</h4>
        <p style="font-size:12px;color:var(--text2)">
          📚 ${a.subject} • 🏫 ${a.class} • ${dueLabel}${a.maxScore&&a.maxScore!==100?` • Max: ${a.maxScore}`:""}
        </p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap">
        <span class="sub-status ${a.closed?"pending":"submitted"}" style="font-size:11px">${a.closed?"🔒 Closed":"🟢 Open"}</span>
        <span class="acard-chev" style="font-size:12px;color:var(--text2)">▼</span>
      </div>
    </div>
    <div class="acard-body" style="display:none;padding-top:14px;border-top:1px solid var(--card-border);margin-top:12px">
      ${a.description ? `<p style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.6">${a.description}</p>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="action-btn view-subs-btn" style="font-size:12px">👁 View Submissions</button>
        ${a.closed
          ? `<button class="action-btn reopen-btn" style="font-size:12px">🔓 Reopen</button>`
          : `<button class="cancel-btn close-btn"  style="font-size:12px">🔒 Close</button>`}
        <button class="cancel-btn edit-assign-btn" style="font-size:12px">✏️ Edit</button>
        <button class="cancel-btn delete-assign-btn" style="font-size:12px;color:#ef4444;border-color:#ef4444">🗑 Delete</button>
      </div>
      <div class="subs-panel" style="margin-top:12px"></div>
    </div>`;

  const body = card.querySelector(".acard-body");
  const chev = card.querySelector(".acard-chev");
  card.querySelector(".acard-hdr").addEventListener("click", () => {
    const open = body.style.display === "none";
    body.style.display = open ? "block" : "none";
    chev.textContent   = open ? "▲" : "▼";
  });
  card.querySelector(".view-subs-btn")?.addEventListener("click", async e => {
    e.stopPropagation();
    const panel = card.querySelector(".subs-panel");
    panel.style.display = "block";
    panel.innerHTML = `<p style="font-size:13px;color:var(--text2)">Loading...</p>`;
    await renderSubmissions(a.id, a.title, a.maxScore||100, panel, a.questions||null);
  });
  card.querySelector(".close-btn")?.addEventListener("click", async e => {
    e.stopPropagation();
    if (!confirm("Close submissions for this assignment?")) return;
    await setDoc(doc(db,"assignments",a.id), { closed:true }, { merge:true });
    toast("Closed.", "info"); loadAssignments();
  });
  card.querySelector(".reopen-btn")?.addEventListener("click", async e => {
    e.stopPropagation();
    const d = prompt("New deadline (YYYY-MM-DDTHH:MM) or leave blank to remove:");
    if (d === null) return;
    await setDoc(doc(db,"assignments",a.id), { closed:false, due:d||null }, { merge:true });
    toast("Reopened!", "success"); loadAssignments();
  });
  card.querySelector(".edit-assign-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    openAssignModal(a);
  });
  card.querySelector(".delete-assign-btn")?.addEventListener("click", async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db,"assignments",a.id));
      toast("Assignment deleted.", "info");
      loadAssignments();
    } catch (err) { toast("Delete failed: " + err.message, "error"); }
  });
  return card;
}

/* ═══════════════════════════════════════
   GRADE MODAL — shows student answer + file (Fix #2-partial)
═══════════════════════════════════════ */
const gradeModal = document.getElementById("gradeModal");
let gradingSubId = null, gradingMaxScore = 100, gradingStudentId = null, gradingTitle = "";

function openGradeModal(subId, studentName, textAnswer, fileUrl, maxScore, assignTitle, studentId, mcqAnswers, questions) {
  gradingSubId      = subId;
  gradingMaxScore   = maxScore;
  gradingStudentId  = studentId;
  gradingTitle      = assignTitle;

  const titleEl    = document.getElementById("gradeModalTitle");
  const infoEl     = document.getElementById("gradeStudentInfo");
  const textEl     = document.getElementById("gradeTextAnswer");
  const contentEl  = document.getElementById("gradeAnswerContent");
  const fileEl     = document.getElementById("gradeFileAnswer");
  const fileLnk    = document.getElementById("gradeFileLink");
  const mcqEl      = document.getElementById("gradeMcqAnswers");
  const mcqContent = document.getElementById("gradeMcqContent");
  const scoreLabel = document.getElementById("gradeScoreLabel");
  const scoreInput = document.getElementById("gradeScoreInput");
  const remarkInput = document.getElementById("gradeRemarkInput");
  const statusEl   = document.getElementById("gradeStatus");

  if (titleEl)    titleEl.textContent    = `Grade: ${assignTitle}`;
  if (infoEl)     infoEl.textContent     = `Student: ${studentName}  •  Max score: ${maxScore}`;
  if (scoreLabel) scoreLabel.textContent = `Score (0–${maxScore})`;
  if (scoreInput) { scoreInput.max = maxScore; scoreInput.value = ""; }
  if (remarkInput) remarkInput.value = "";
  if (statusEl)  { statusEl.style.display = "none"; statusEl.textContent = ""; }

  // MCQ answers
  const hasMcq = mcqAnswers && questions && questions.length > 0;
  if (hasMcq && mcqEl && mcqContent) {
    mcqEl.style.display = "block";
    mcqContent.innerHTML = questions.map((q, qi) => {
      const studentPick = mcqAnswers[qi] ?? mcqAnswers[String(qi)];
      const correct     = q.correct;
      const opts        = (q.options || []).filter(o => o.trim());
      return `<div style="background:var(--bg3);border:1px solid var(--card-border);border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">Q${qi+1}. ${q.question}</p>
        ${opts.map((opt, oi) => {
          const isChosen  = studentPick === oi;
          const isCorrect = correct === oi;
          let bg = "var(--bg2)", border = "var(--card-border)", icon = "";
          if (isChosen && isCorrect)  { bg = "rgba(74,222,128,.12)"; border = "#4ade80"; icon = " ✅"; }
          else if (isChosen)          { bg = "rgba(239,68,68,.12)";  border = "#ef4444"; icon = " ❌"; }
          else if (isCorrect)         { bg = "rgba(74,222,128,.07)"; border = "#4ade80"; icon = " ✔ (correct)"; }
          return `<div style="padding:7px 12px;background:${bg};border:1px solid ${border};border-radius:8px;margin-bottom:5px;font-size:12px;color:var(--text)">
            ${isChosen ? "▶ " : ""}${opt}${icon}
          </div>`;
        }).join("")}
      </div>`;
    }).join("");
  } else {
    if (mcqEl) mcqEl.style.display = "none";
  }

  // Text answer
  if (textAnswer && textAnswer.trim()) {
    if (textEl)    textEl.style.display  = "block";
    if (contentEl) contentEl.textContent = textAnswer.trim();
  } else {
    if (textEl) textEl.style.display = "none";
  }

  // File link
  if (fileUrl) {
    if (fileEl)  fileEl.style.display = "block";
    if (fileLnk) fileLnk.href         = fileUrl;
  } else {
    if (fileEl) fileEl.style.display = "none";
  }

  if (!hasMcq && !textAnswer?.trim() && !fileUrl) {
    if (infoEl) infoEl.innerHTML = infoEl.textContent +
      `<br><span style="color:#fb923c;font-size:12px">⚠️ This student did not submit any content.</span>`;
  }

  gradeModal?.classList.add("open");
}

document.getElementById("closeGradeModal")?.addEventListener("click", () => gradeModal?.classList.remove("open"));
gradeModal?.addEventListener("click", e => { if (e.target === gradeModal) gradeModal.classList.remove("open"); });

document.getElementById("confirmGradeBtn")?.addEventListener("click", async () => {
  const score    = parseFloat(document.getElementById("gradeScoreInput")?.value);
  const remark   = (document.getElementById("gradeRemarkInput")?.value || "").trim();
  const statusEl = document.getElementById("gradeStatus");
  const btn      = document.getElementById("confirmGradeBtn");

  if (isNaN(score) || score < 0 || score > gradingMaxScore) {
    toast(`Score must be 0–${gradingMaxScore}.`, "warning"); return;
  }
  btn.disabled = true; btn.textContent = "Saving...";
  if (statusEl) { statusEl.style.display = "block"; statusEl.style.color = "#9ba3b8"; statusEl.textContent = "Saving grade..."; }

  try {
    await setDoc(doc(db,"assignmentSubmissions",gradingSubId), {
      grade:score, remark, gradedAt:serverTimestamp(), gradedBy:teacherData.name
    }, { merge:true });

    // Notify student
    if (gradingStudentId) {
      await addDoc(collection(db,"notifications"), {
        userId:    gradingStudentId, type: "grade",
        message:   `🏆 Your assignment "${gradingTitle}" was graded: ${score}/${gradingMaxScore}${remark?` — "${remark}"`:""}`,
        read:      false, createdAt: serverTimestamp()
      });
    }

    if (statusEl) { statusEl.textContent = "✅ Saved!"; statusEl.style.color = "#4ade80"; }
    toast("Grade saved and student notified!", "success");
    setTimeout(() => gradeModal?.classList.remove("open"), 1200);
    loadAssignments();
  } catch (err) {
    if (statusEl) { statusEl.textContent = "❌ " + err.message; statusEl.style.color = "#ef4444"; }
    toast("Failed: " + err.message, "error");
  } finally { btn.textContent = "✅ Save Grade & Notify Student"; btn.disabled = false; }
});

async function renderSubmissions(assignId, assignTitle, maxScore, panelEl, questions) {
  try {
    const snap = await getDocs(query(collection(db,"assignmentSubmissions"),
      where("assignmentId","==",assignId)));
    if (snap.empty) {
      panelEl.innerHTML = `<p style="font-size:13px;color:var(--text2);padding:10px 0">No submissions yet.</p>`; return;
    }
    panelEl.innerHTML = `<p style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">${snap.size} Submission${snap.size>1?"s":""}</p>`;
    snap.forEach(d => {
      const s   = d.data();
      const graded = s.grade !== undefined && s.grade !== null;
      const isMcqSub = s.assignType === "mcq" || (s.mcqAnswers && Object.keys(s.mcqAnswers).length > 0);
      const item = document.createElement("div");
      item.style.cssText = "background:var(--bg3);border:1px solid var(--card-border);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap";
      item.innerHTML = `
        <div style="flex:1;min-width:0">
          <p style="font-size:13px;font-weight:700;margin-bottom:2px">${s.studentName}</p>
          <p style="font-size:11px;color:var(--text2)">${s.submittedAt?.toDate?.()?.toLocaleDateString("en-NG")||"Recently"}</p>
          ${isMcqSub ? `<span style="font-size:10px;font-weight:700;color:#818cf8;background:rgba(99,102,241,.15);padding:2px 7px;border-radius:10px;margin-top:3px;display:inline-block">🔘 MCQ — click Grade to review answers</span>` : ""}
          ${s.textAnswer ? `<p style="font-size:12px;color:var(--text2);margin-top:4px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${s.textAnswer.slice(0,80)}${s.textAnswer.length>80?"...":""}"</p>` : ""}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0">
          ${s.fileUrl ? `<a href="${s.fileUrl}" target="_blank" class="view-submission-btn">📎 File</a>` : ""}
          ${graded
            ? `<span class="sub-status submitted" style="font-size:11px">✅ ${s.grade}/${maxScore}${s.remark?` — "${s.remark}"`:""}${s.autoGraded?" (auto)":""}</span>
               <button class="action-btn re-grade-btn" style="font-size:12px;padding:5px 12px" data-sub-id="${d.id}">✏️ Re-grade</button>`
            : `<button class="action-btn grade-open-btn" style="font-size:12px;padding:5px 12px" data-sub-id="${d.id}">✏️ Grade</button>`}
        </div>`;

      const gradeBtn = item.querySelector(".grade-open-btn, .re-grade-btn");
      gradeBtn?.addEventListener("click", () =>
        openGradeModal(d.id, s.studentName, s.textAnswer||"", s.fileUrl||"",
          maxScore, assignTitle, s.studentId, s.mcqAnswers||null, questions||null)
      );

      panelEl.appendChild(item);
    });
  } catch (err) { panelEl.innerHTML = `<p style="color:#ef4444;font-size:13px">Error: ${err.message}</p>`; }
}

async function loadAllSubmissions() {
  if (!teacherData) return;
  const container = document.getElementById("submissionsList"); if (!container) return;
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  try {
    const snap = await getDocs(query(collection(db,"assignments"),
      where("teacherId","==",teacherData._uid)));
    if (snap.empty) { container.innerHTML = `<p class="empty-msg">No assignments yet.</p>`; return; }
    container.innerHTML = "";
    for (const d of snap.docs) {
      const a    = d.data();
      const sec  = document.createElement("div"); sec.style.marginBottom = "20px";
      sec.innerHTML = `<p style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📌 ${a.title}</p>`;
      const panel = document.createElement("div"); sec.appendChild(panel);
      await renderSubmissions(d.id, a.title, a.maxScore||100, panel, a.questions||null);
      container.appendChild(sec);
    }
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
}

/* ═══════════════════════════════════════
   RESOURCES
═══════════════════════════════════════ */
const resourceModal = document.getElementById("resourceModal");
document.getElementById("openResourceModal")?.addEventListener("click",  () => resourceModal?.classList.add("open"));
document.getElementById("closeResourceModal")?.addEventListener("click", () => resourceModal?.classList.remove("open"));
resourceModal?.addEventListener("click", e => { if (e.target === resourceModal) resourceModal.classList.remove("open"); });

document.getElementById("saveResourceBtn")?.addEventListener("click", async () => {
  const title   = (document.getElementById("resTitle")?.value  || "").trim();
  const cls     =  document.getElementById("resClass")?.value  || "";
  const subject =  document.getElementById("resSubject")?.value|| "";
  const file    =  document.getElementById("resFile")?.files[0];
  if (!title||!cls||!subject||!file) { toast("Fill all fields and select a file.", "warning"); return; }
  const btn = document.getElementById("saveResourceBtn"); btn.textContent = "Uploading..."; btn.disabled = true;
  try {
    const task = uploadBytesResumable(
      ref(storage, `resources/${teacherData._uid}/${Date.now()}_${file.name}`), file, { contentType:file.type });
    task.on("state_changed", null,
      err => { toast("Upload failed: " + err.message, "error"); btn.textContent="Upload"; btn.disabled=false; },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db,"resources"), {
          title, class:cls, subject, fileName:file.name, fileUrl:url,
          teacherId:teacherData._uid, createdAt:serverTimestamp()
        });
        resourceModal.classList.remove("open");
        const rt=document.getElementById("resTitle"); if(rt) rt.value="";
        const rf=document.getElementById("resFile");  if(rf) rf.value="";
        btn.textContent="Upload"; btn.disabled=false;
        loadResources(); toast("Resource uploaded!", "success");
      }
    );
  } catch (err) { toast("Failed: "+err.message,"error"); btn.textContent="Upload"; btn.disabled=false; }
});

async function loadResources() {
  if (!teacherData) return;
  const container = document.getElementById("resourcesList"); if (!container) return;
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  try {
    const snap = await getDocs(query(collection(db,"resources"),
      where("teacherId","==",teacherData._uid)));
    if (snap.empty) { container.innerHTML = `<p class="empty-msg">No materials yet.</p>`; return; }
    container.innerHTML = "";
    snap.forEach(d => {
      const r = d.data();
      const card = document.createElement("div"); card.className = "res-card";
      card.innerHTML = `<h4>📄 ${r.title}</h4><p>📚 ${r.subject} | 🏫 ${r.class}</p>
        <a href="${r.fileUrl}" target="_blank" style="display:inline-block;margin-top:10px;color:#60a5fa;font-size:13px">⬇ ${r.fileName}</a>`;
      container.appendChild(card);
    });
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
}

/* ═══════════════════════════════════════
   LOGOUT
═══════════════════════════════════════ */
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if (notifUnsubscribe) notifUnsubscribe();
  await signOut(auth);
  window.location.href = "teacher-login.html";
});
/* ════════════════════════════════════════════════════
   TESTS & CA — TEACHER
════════════════════════════════════════════════════ */
let testQuestions = [];
let editingTestId = null;
const testModal        = document.getElementById("testModal");
const testResultsModal = document.getElementById("testResultsModal");

/* ── Populate testClassList & testSubject from teacher data ── */
function populateTestDropdowns() {
  if (!teacherData) return;
  const classes  = teacherData.classesTeaching || [];
  const subjects = teacherData.subjectsTaught  || [];
  const cl = document.getElementById("testClassList");
  if (cl) {
    cl.innerHTML = classes.map(c =>
      `<label class="type-chip" style="padding:5px 10px;font-size:12px">
         <input type="checkbox" class="test-class-chk" value="${c}"> ${c}
       </label>`
    ).join("");
  }
  const sl = document.getElementById("testSubject");
  if (sl) {
    sl.innerHTML = `<option value="">Select Subject</option>` +
      subjects.map(s => `<option value="${s}">${s}</option>`).join("");
  }
}

/* ── Question builder ── */
function renderTestQuestions() {
  const container = document.getElementById("testQuestionsList");
  if (!container) return;
  container.innerHTML = "";
  testQuestions.forEach((q, qi) => {
    const isLast = qi === testQuestions.length - 1;
    const card = document.createElement("div");
    card.className = q.type === "mcq" ? "mcq-card" : "theory-card";
    if (q.type === "mcq") {
      card.innerHTML = `
        <div class="mcq-card-header">
          <span class="mcq-qnum">Q${qi+1} · Objective</span>
          <button class="remove-q-btn" data-qi="${qi}">✕ Remove</button>
        </div>
        <input class="mcq-question-input" placeholder="Question text..." value="${q.question||""}" data-qi="${qi}">
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-weight:600">Options — select correct answer:</div>
        ${["A","B","C","D"].map((opt,oi) => `
          <div class="mcq-option-row">
            <input type="radio" name="tq${qi}_correct" value="${oi}" ${q.correct===oi?"checked":""} data-qi="${qi}" data-oi="${oi}" class="tq-correct-radio">
            <input type="text" placeholder="Option ${opt}" value="${q.options[oi]||""}" data-qi="${qi}" data-oi="${oi}" class="tq-option-input">
          </div>`).join("")}
        ${isLast ? `
        <div style="display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--card-border)">
          <button class="action-btn add-next-mcq"  style="padding:5px 12px;font-size:12px">+ Objective</button>
          <button style="padding:5px 12px;font-size:12px;border:1px solid var(--card-border);background:var(--bg2);color:var(--text);border-radius:8px;cursor:pointer" class="add-next-text">+ Theory</button>
        </div>` : ""}`;
    } else {
      card.innerHTML = `
        <div class="mcq-card-header">
          <span class="mcq-qnum">Q${qi+1} · Theory</span>
          <button class="remove-q-btn" data-qi="${qi}">✕ Remove</button>
        </div>
        <input class="mcq-question-input" placeholder="Question text..." value="${q.question||""}" data-qi="${qi}">
        <div style="font-size:11px;color:var(--text2);margin-top:4px;margin-bottom:${isLast?"10px":"0"}">Students will type their answer.</div>
        ${isLast ? `
        <div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--card-border)">
          <button class="action-btn add-next-mcq"  style="padding:5px 12px;font-size:12px">+ Objective</button>
          <button style="padding:5px 12px;font-size:12px;border:1px solid var(--card-border);background:var(--bg2);color:var(--text);border-radius:8px;cursor:pointer" class="add-next-text">+ Theory</button>
        </div>` : ""}`;
    }
    container.appendChild(card);
    card.querySelector(".remove-q-btn").addEventListener("click", () => { testQuestions.splice(qi,1); renderTestQuestions(); });
    card.querySelector(".mcq-question-input").addEventListener("input", e => { testQuestions[qi].question = e.target.value; });
    if (q.type === "mcq") {
      card.querySelectorAll(".tq-option-input").forEach(inp => {
        inp.addEventListener("input", e => { testQuestions[qi].options[parseInt(e.target.dataset.oi)] = e.target.value; });
      });
      card.querySelectorAll(".tq-correct-radio").forEach(r => {
        r.addEventListener("change", e => { testQuestions[qi].correct = parseInt(e.target.value); });
      });
    }
    card.querySelector(".add-next-mcq")?.addEventListener("click", () => {
      testQuestions.push({ type:"mcq", question:"", options:["","","",""], correct:0 });
      renderTestQuestions();
      setTimeout(() => container.lastElementChild?.scrollIntoView({ behavior:"smooth", block:"nearest" }), 50);
    });
    card.querySelector(".add-next-text")?.addEventListener("click", () => {
      testQuestions.push({ type:"text", question:"" });
      renderTestQuestions();
      setTimeout(() => container.lastElementChild?.scrollIntoView({ behavior:"smooth", block:"nearest" }), 50);
    });
  });
}

document.getElementById("addTestMcq")?.addEventListener("click", () => {
  testQuestions.push({ type:"mcq", question:"", options:["","","",""], correct:0 });
  renderTestQuestions();
});
document.getElementById("addTestText")?.addEventListener("click", () => {
  testQuestions.push({ type:"text", question:"" });
  renderTestQuestions();
});

/* ── Mode toggle: hide deadline for live mode ── */
document.querySelectorAll("input[name='testMode']").forEach(r => {
  r.addEventListener("change", e => {
    const dg = document.getElementById("testDeadlineGroup");
    if (dg) dg.style.display = e.target.value === "live" ? "none" : "flex";
  });
});

/* ── Open / close test modal ── */
document.getElementById("openTestModal")?.addEventListener("click", () => {
  editingTestId = null;
  testQuestions = [];
  renderTestQuestions();
  populateTestDropdowns();
  const h = document.getElementById("testModalHeading"); if (h) h.textContent = "Create Test";
  document.getElementById("testTitle").value = "";
  document.getElementById("testDuration").value = "30";
  document.getElementById("testMaxScore").value = "30";
  document.getElementById("testDeadline").value = "";
  testModal?.classList.add("open");
});
document.getElementById("closeTestModal")?.addEventListener("click", () => { testModal?.classList.remove("open"); editingTestId=null; testQuestions=[]; });
testModal?.addEventListener("click", e => { if (e.target===testModal) { testModal.classList.remove("open"); editingTestId=null; testQuestions=[]; } });
document.getElementById("closeTestResultsModal")?.addEventListener("click", () => testResultsModal?.classList.remove("open"));
testResultsModal?.addEventListener("click", e => { if (e.target===testResultsModal) testResultsModal.classList.remove("open"); });

/* ── Save test ── */
document.getElementById("saveTestBtn")?.addEventListener("click", async () => {
  const title     = (document.getElementById("testTitle")?.value||"").trim();
  const selCls    = [...document.querySelectorAll(".test-class-chk:checked")].map(c=>c.value);
  const subject   = document.getElementById("testSubject")?.value||"";
  const term      = document.getElementById("testTerm")?.value||"";
  const mode      = document.querySelector("input[name='testMode']:checked")?.value||"deadline";
  const duration  = parseInt(document.getElementById("testDuration")?.value)||30;
  const maxScore  = parseInt(document.getElementById("testMaxScore")?.value)||30;
  const deadline  = mode==="deadline" ? (document.getElementById("testDeadline")?.value||"") : null;

  if (!title)    { toast("Enter a test title.", "warning"); return; }
  if (!selCls.length) { toast("Select at least one class.", "warning"); return; }
  if (!subject)  { toast("Select a subject.", "warning"); return; }
  if (!term)     { toast("Select a term.", "warning"); return; }
  if (testQuestions.length===0) { toast("Add at least one question.", "warning"); return; }
  const incomplete = testQuestions.some(q => !q.question.trim() ||
    (q.type==="mcq" && q.options.filter(o=>o.trim()).length < 2));
  if (incomplete) { toast("All questions need text and at least 2 options (MCQ).", "warning"); return; }

  const btn = document.getElementById("saveTestBtn");
  btn.disabled=true; btn.textContent="Saving...";
  try {
    // Upload optional file
    let attachmentUrl = null;
    const fileInp = document.getElementById("testFile");
    if (fileInp?.files?.[0]) {
      const f = fileInp.files[0];
      const statusEl = document.getElementById("testFileStatus");
      if (statusEl) { statusEl.textContent="⏳ Uploading..."; statusEl.style.display="block"; }
      const storRef = ref(storage, `tests/${teacherData.schoolSlug}/${Date.now()}_${f.name}`);
      const snap = await new Promise((res,rej)=>{
        const task = uploadBytesResumable(storRef,f);
        task.on("state_changed",null,rej,()=>res(task.snapshot));
      });
      attachmentUrl = await getDownloadURL(snap.ref);
      if (statusEl) statusEl.style.display="none";
    }

    const baseDoc = {
      title, subject, term, mode, duration, maxScore, deadline: deadline||null,
      questions: testQuestions, teacherId: teacherData._uid,
      teacherName: teacherData.name, school: teacherData.school||"",
      classes: selCls, status: mode==="live" ? "pending" : "open",
      createdAt: serverTimestamp(),
      ...(attachmentUrl ? { attachmentUrl } : {})
    };

    if (editingTestId) {
      await setDoc(doc(db,"tests",editingTestId), baseDoc, { merge:true });
      toast("Test updated!", "success");
    } else {
      const testRef = await addDoc(collection(db,"tests"), baseDoc);
      // Notify students
      try {
        await Promise.all(selCls.map(async cls => {
          const ss = await getDocs(query(collection(db,"users"),
            where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
          return Promise.all(ss.docs.map(sd =>
            addDoc(collection(db,"notifications"), {
              userId: sd.id, type:"test",
              message: `🧪 New test: "${title}" — ${subject} (${term})${mode==="deadline"&&deadline ? ` · Due ${deadline.split("T")[0]}` : mode==="live" ? " · Live — teacher will start it" : ""}`,
              read:false, createdAt:serverTimestamp()
            })
          ));
        }));
      } catch {}
      toast(`Test created for ${selCls.join(", ")}!`, "success");
    }
    testModal?.classList.remove("open");
    editingTestId=null; testQuestions=[];
    loadTests();
  } catch(err) { toast("Failed: "+err.message,"error"); }
  finally { btn.disabled=false; btn.textContent="Save Test"; }
});

/* ── Load tests list ── */
async function loadTests() {
  if (!teacherData) return;
  const container = document.getElementById("testsList"); if (!container) return;
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  try {
    const snap = await getDocs(query(collection(db,"tests"), where("teacherId","==",teacherData._uid)));
    if (snap.empty) { container.innerHTML=`<p class="empty-msg">No tests yet.</p>`; return; }
    const tests = snap.docs.map(d=>({id:d.id,...d.data()}));
    tests.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
    container.innerHTML="";
    tests.forEach(t => {
      const card = document.createElement("div");
      card.className="test-card";
      const isLive   = t.mode==="live";
      const isActive = isLive && t.status==="active";
      const isPending= isLive && t.status==="pending";
      card.innerHTML=`
        <div class="test-card-info">
          <h4>${t.title}</h4>
          <p>${t.subject} · ${t.term} · ${(t.classes||[]).join(", ")} · ${t.questions?.length||0} questions · ${t.duration} min · Max: ${t.maxScore}</p>
          <p style="margin-top:4px">
            ${isLive ? `<span class="live-badge ${isActive?"active":""}">🔴 ${isActive?"LIVE NOW":isPending?"Pending start":"Ended"}</span>` :
              `<span class="person-badge ${t.status==="open"?"blue":""}">${t.status==="open"?"Open":"Closed"}</span>`}
            ${t.deadline ? `<span style="font-size:11px;color:var(--text2);margin-left:8px">Due: ${new Date(t.deadline).toLocaleString("en-NG",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>` : ""}
          </p>
        </div>
        <div class="test-card-actions">
          ${isLive && isPending ? `<button class="action-btn" style="background:#ef4444" data-id="${t.id}" data-action="start-live">▶ Start Now</button>` : ""}
          ${isLive && isActive  ? `<button class="action-btn" style="background:#64748b" data-id="${t.id}" data-action="end-live">⏹ End Test</button>` : ""}
          <button class="action-btn" style="background:var(--bg3);color:var(--text);border:1px solid var(--card-border)" data-id="${t.id}" data-action="results">📊 Results</button>
          <button class="action-btn" style="background:#ef4444" data-id="${t.id}" data-test="${encodeURIComponent(JSON.stringify(t))}" data-action="delete">🗑</button>
        </div>`;
      card.querySelectorAll("button[data-action]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const action = btn.dataset.action;
          const id     = btn.dataset.id;
          if (action==="start-live") {
            if (!confirm("Start this live test now? Students will be notified immediately.")) return;
            await updateDoc(doc(db,"tests",id), { status:"active", startedAt: serverTimestamp() });
            // Notify students
            try {
              const snap2 = await getDoc(doc(db,"tests",id));
              const td2 = snap2.data();
              await Promise.all((td2.classes||[]).map(async cls => {
                const ss = await getDocs(query(collection(db,"users"),
                  where("role","==","student"), where("school","==",teacherData.school), where("studentClass","==",cls)));
                return Promise.all(ss.docs.map(sd =>
                  addDoc(collection(db,"notifications"), {
                    userId:sd.id, type:"test_live",
                    message: `🔴 LIVE TEST STARTED: "${td2.title}" — ${td2.subject}. Open your Tests tab NOW!`,
                    read:false, urgent:true, createdAt:serverTimestamp()
                  })
                ));
              }));
            } catch {}
            toast("Test is now LIVE!", "success"); loadTests();
          } else if (action==="end-live") {
            if (!confirm("End this live test? Students won't be able to submit anymore.")) return;
            await updateDoc(doc(db,"tests",id), { status:"ended" });
            toast("Test ended.", "info"); loadTests();
          } else if (action==="results") {
            viewTestResults(id);
          } else if (action==="delete") {
            if (!confirm("Delete this test? This cannot be undone.")) return;
            await deleteDoc(doc(db,"tests",id));
            toast("Test deleted.", "info"); loadTests();
          }
        });
      });
      container.appendChild(card);
    });
  } catch(err) { container.innerHTML=`<p class="empty-msg">Error: ${err.message}</p>`; }
}

/* ── Test results viewer ── */
async function viewTestResults(testId) {
  testResultsModal?.classList.add("open");
  const content = document.getElementById("testResultsContent");
  if (content) content.innerHTML=`<p class="empty-msg">Loading...</p>`;
  try {
    const [testSnap, subsSnap] = await Promise.all([
      getDoc(doc(db,"tests",testId)),
      getDocs(query(collection(db,"testSubmissions"), where("testId","==",testId)))
    ]);
    if (!testSnap.exists()) { if (content) content.innerHTML=`<p class="empty-msg">Test not found.</p>`; return; }
    const t = testSnap.data();
    const h = document.getElementById("testResultsTitle"); if (h) h.textContent=t.title;
    const subs = subsSnap.docs.map(d=>({id:d.id,...d.data()}));
    subs.sort((a,b)=>(b.submittedAt?.toMillis?.()||0)-(a.submittedAt?.toMillis?.()||0));
    if (!content) return;
    if (subs.length===0) { content.innerHTML=`<p class="empty-msg">No submissions yet.</p>`; return; }

    content.innerHTML=`<p style="font-size:12px;color:var(--text2);margin-bottom:16px">${subs.length} submission(s) · Max score: ${t.maxScore}</p>`;

    subs.forEach((s, i) => {
      const graded = s.score != null;
      const subBlock = document.createElement("div");
      subBlock.style.cssText = "background:var(--bg3);border:1px solid var(--card-border);border-radius:12px;padding:14px 16px;margin-bottom:14px";

      // Header row
      const headerRow = document.createElement("div");
      headerRow.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px";
      headerRow.innerHTML = `
        <div>
          <p style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px">${s.studentName||"—"}</p>
          <p style="font-size:11px;color:var(--text2)">${s.studentClass||"—"} · ${s.submittedAt?.toDate?.()?.toLocaleString("en-NG",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})||"Recently"}</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:18px;font-weight:800;color:${graded?"var(--accent)":"var(--text2)"}">${graded ? s.score+"/"+t.maxScore : "Not graded"}</span>
          <button class="action-btn grade-test-sub-btn" data-sub-id="${s.id}" style="font-size:12px;padding:5px 12px">${graded?"✏️ Re-grade":"✏️ Grade"}</button>
        </div>`;
      subBlock.appendChild(headerRow);

      // MCQ answers review
      if (t.questions && t.questions.length > 0 && s.answers) {
        const answersDiv = document.createElement("div");
        t.questions.forEach((q, qi) => {
          const studentPick = s.answers[qi] ?? s.answers[String(qi)];
          const correct     = q.correct;
          const opts        = (q.options||[]).filter(o=>o.trim());
          const isAnswered  = studentPick !== undefined && studentPick !== null;
          const qDiv = document.createElement("div");
          qDiv.style.cssText = "margin-bottom:10px";
          qDiv.innerHTML = `<p style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">Q${qi+1}. ${q.question}</p>`;
          if (opts.length > 0) {
            // MCQ options
            opts.forEach((opt, oi) => {
              const isChosen  = studentPick === oi;
              const isCorrect = correct === oi;
              let bg = "var(--bg2)", border = "var(--card-border)", icon = "";
              if (isChosen && isCorrect)  { bg="rgba(74,222,128,.12)"; border="#4ade80"; icon=" ✅"; }
              else if (isChosen)          { bg="rgba(239,68,68,.12)";  border="#ef4444"; icon=" ❌"; }
              else if (isCorrect)         { bg="rgba(74,222,128,.07)"; border="#4ade80"; icon=" ✔ (correct)"; }
              const optEl = document.createElement("div");
              optEl.style.cssText = `padding:5px 10px;background:${bg};border:1px solid ${border};border-radius:7px;margin-bottom:4px;font-size:12px;color:var(--text)`;
              optEl.textContent = `${isChosen?"▶ ":""}${opt}${icon}`;
              qDiv.appendChild(optEl);
            });
          } else {
            // Theory answer
            const ans = s.answers[qi] || s.answers[String(qi)] || "";
            const ansEl = document.createElement("div");
            ansEl.style.cssText = "background:var(--bg2);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:8px 12px;font-size:12px;color:var(--text);white-space:pre-wrap";
            ansEl.textContent = ans || "(No answer provided)";
            qDiv.appendChild(ansEl);
          }
          answersDiv.appendChild(qDiv);
        });
        subBlock.appendChild(answersDiv);
      }

      content.appendChild(subBlock);

      // Grade button
      subBlock.querySelector(".grade-test-sub-btn").addEventListener("click", () => {
        const current = s.score != null ? s.score : "";
        const input   = prompt(`Score for ${s.studentName} (0–${t.maxScore}):`, current);
        if (input === null) return;
        const n = parseFloat(input);
        if (isNaN(n)||n<0||n>t.maxScore) { toast("Invalid score.","warning"); return; }
        updateDoc(doc(db,"testSubmissions",s.id), { score:n, gradedAt:serverTimestamp() })
          .then(async () => {
            // Notify student
            try {
              await addDoc(collection(db,"notifications"), {
                userId:  s.studentId,
                type:    "grade",
                message: `🏆 Your test "${t.title}" was graded: ${n}/${t.maxScore}`,
                read:    false, createdAt: serverTimestamp()
              });
            } catch {}
            toast("Score saved!", "success");
            viewTestResults(testId);
          })
          .catch(err => toast("Failed: "+err.message, "error"));
      });
    });
  } catch(err) { if (content) content.innerHTML=`<p class="empty-msg">Error: ${err.message}</p>`; }
}

/* ── Grade a theory test submission (legacy inline call — kept for safety) ── */
window.gradeTestSub = async function(subId, testId, maxScore) {
  const score = prompt(`Enter score (0–${maxScore}):`);
  if (score === null) return;
  const n = parseFloat(score);
  if (isNaN(n)||n<0||n>maxScore) { toast("Invalid score.","warning"); return; }
  await updateDoc(doc(db,"testSubmissions",subId), { score: n, gradedAt: serverTimestamp() });
  toast("Score saved!","success");
  viewTestResults(testId);
};

/* ── Tab switcher for tests section ── */
document.querySelectorAll("#sec-tests .tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#sec-tests .tab-btn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll("#sec-tests .tab-pane").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
  });
});