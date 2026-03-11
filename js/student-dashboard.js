import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
  query, where, getDocs, addDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk8lgaU1c7n2-Mt3TetoUE2JGJDA7U6F8",
  authDomain: "smartschool-system.firebaseapp.com",
  projectId: "smartschool-system",
  storageBucket: "smartschool-system.firebasestorage.app",
  messagingSenderId: "122165307933",
  appId: "1:122165307933:web:a604d91489aa62924434f4"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

let studentData = null;

/* ════════════════════════════════
   TOAST NOTIFICATIONS
════════════════════════════════ */
function toast(msg, type = "info", duration = 3500) {
  const icons = { success:"✅", error:"❌", info:"ℹ️", warning:"⚠️" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 350);
  }, duration);
}

/* ════════════════════════════════
   SIDEBAR
════════════════════════════════ */
const sidebar        = document.getElementById("sidebar");
const mainArea       = document.getElementById("mainArea");
const sidebarToggle  = document.getElementById("sidebarToggle");
const mobileToggle   = document.getElementById("mobileToggle");
const sidebarOverlay = document.getElementById("sidebarOverlay");

sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  mainArea.classList.toggle("collapsed");
});
mobileToggle.addEventListener("click", () => {
  sidebar.classList.add("mobile-open");
  sidebarOverlay.classList.add("active");
});
sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
});

/* ════════════════════════════════
   SEARCH
════════════════════════════════ */
const globalSearch = document.getElementById("globalSearch");
if (globalSearch) {
  globalSearch.addEventListener("input", debounce(async e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      document.querySelectorAll(".assign-card").forEach(c => c.style.display = "");
      document.querySelectorAll(".resource-card").forEach(c => c.style.display = "");
      return;
    }

    // Ensure assignments and resources are loaded before searching
    const aSection = document.getElementById("sec-assignments");
    const rSection = document.getElementById("sec-resources");
    if (!aSection.querySelector(".assign-card") && studentData) await loadAssignments();
    if (!rSection.querySelector(".resource-card") && studentData) await loadResources();

    // Search assignments (inside term groups)
    let aHits = 0;
    document.querySelectorAll(".assign-card").forEach(card => {
      const match = card.textContent.toLowerCase().includes(q);
      card.style.display = match ? "" : "none";
      if (match) aHits++;
    });

    // Search resources
    let rHits = 0;
    document.querySelectorAll(".resource-card").forEach(card => {
      const match = card.textContent.toLowerCase().includes(q);
      card.style.display = match ? "" : "none";
      if (match) rHits++;
    });

    // Search results by subject name
    let resHits = 0;
    document.querySelectorAll(".result-subject-card").forEach(card => {
      const match = card.textContent.toLowerCase().includes(q);
      card.style.display = match ? "" : "none";
      if (match) resHits++;
    });

    // Navigate to section with most hits
    if (aHits > 0) switchSection("assignments");
    else if (rHits > 0) switchSection("resources");
    else if (resHits > 0) switchSection("results");
  }, 400));
}

function debounce(fn, delay) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* ════════════════════════════════
   SECTION NAVIGATION
════════════════════════════════ */
const sectionNames = {
  dashboard:   "Dashboard",
  results:     "My Results",
  reportcards: "Report Cards",
  attendance:  "Attendance",
  assignments: "Assignments",
  resources:   "Resources",
  profile:     "My Profile",
  settings:    "Settings"
};

function switchSection(name) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const btn = document.querySelector(`.nav-item[data-section="${name}"]`);
  const sec = document.getElementById(`sec-${name}`);
  if (btn) btn.classList.add("active");
  if (sec) sec.classList.add("active");
  document.getElementById("sectionTitle").textContent = sectionNames[name] || name;
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");

  // Lazy-load section data
  const loaders = {
    results:     loadResults,
    reportcards: loadReportCards,
    attendance:  () => {},
    assignments: loadAssignments,
    resources:   loadResources,
  };
  if (loaders[name]) loaders[name]();
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});

// Quick links
document.querySelectorAll(".ql-btn").forEach(btn => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});

/* ════════════════════════════════
   THEME
════════════════════════════════ */
const themeToggle    = document.getElementById("themeToggle");
const darkModeSwitch = document.getElementById("darkModeSwitch");

function setTheme(dark) {
  document.body.classList.toggle("light-mode", !dark);
  themeToggle.textContent = dark ? "🌙" : "☀️";
  if (darkModeSwitch) darkModeSwitch.checked = dark;
  localStorage.setItem("smartschool_student_theme", dark ? "dark" : "light");
}
setTheme(localStorage.getItem("smartschool_student_theme") !== "light");
themeToggle.addEventListener("click", () => setTheme(document.body.classList.contains("light-mode")));
if (darkModeSwitch) darkModeSwitch.addEventListener("change", () => setTheme(darkModeSwitch.checked));

/* ════════════════════════════════
   NOTIFICATIONS — realtime listener
════════════════════════════════ */
const notifWrapper = document.getElementById("notifWrapper");
let notifUnsubscribe = null;

document.getElementById("notificationBtn").addEventListener("click", () => {
  notifWrapper.classList.toggle("open");
});
document.addEventListener("click", e => { if (!notifWrapper.contains(e.target)) notifWrapper.classList.remove("open"); });

function startStudentNotifListener(uid) {
  if (notifUnsubscribe) notifUnsubscribe();
  const q = query(collection(db,"notifications"), where("userId","==",uid));

  notifUnsubscribe = onSnapshot(q, snap => {
    const unread  = snap.docs.filter(d => d.data().read !== true);
    const count   = unread.length;
    const badge   = document.getElementById("notifBadge");
    const itemsEl = document.getElementById("notifItems");

    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? "flex" : "none"; }

    if (count === 0) {
      itemsEl.innerHTML = `<p class="notif-empty">No new notifications</p>`;
      return;
    }

    itemsEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${count} unread</span>
        <button id="markAllReadStudent" style="background:none;border:none;color:var(--accent);font-size:11px;font-weight:600;cursor:pointer">Mark all read</button>
      </div>`;

    unread.forEach(d => {
      const n = d.data();
      const icon = n.type === "grade" ? "🏆" : n.type === "result" ? "📊" : n.type === "assignment" ? "📌" : "🔔";
      const item = document.createElement("div");
      item.className = "notif-item";
      item.innerHTML = `
        <div style="display:flex;gap:8px;align-items:flex-start">
          <span style="font-size:16px;flex-shrink:0">${icon}</span>
          <span style="flex:1;font-size:13px;color:var(--text);line-height:1.5">${n.message}</span>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="notif-read-btn" data-id="${d.id}" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px" title="Mark read">✓</button>
            <button class="notif-del-btn"  data-id="${d.id}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px" title="Delete">✕</button>
          </div>
        </div>`;
      item.querySelector(".notif-read-btn").addEventListener("click", () =>
        setDoc(doc(db,"notifications",d.id), { read:true }, { merge:true }));
      item.querySelector(".notif-del-btn").addEventListener("click", () =>
        deleteDoc(doc(db,"notifications",d.id)));
      itemsEl.appendChild(item);
    });

    itemsEl.querySelector("#markAllReadStudent")?.addEventListener("click", () =>
      Promise.all(unread.map(d => setDoc(doc(db,"notifications",d.id), { read:true }, { merge:true })))
    );
  }, err => console.error("Student notif error:", err));
}

/* ════════════════════════════════
   AUTH & LOAD STUDENT
════════════════════════════════ */
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "student-login.html"; return; }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { alert("Student record not found."); return; }

  studentData = { ...snap.data(), _uid: user.uid };

  if (studentData.role !== "student") {
    window.location.href = "student-login.html";
    return;
  }

  fillUI(studentData);
  setWelcomeMessage();
  loadDashboard();
  startStudentNotifListener(user.uid);
});

/* ════════════════════════════════
   FILL UI
════════════════════════════════ */
function fillUI(data) {
  // Sidebar
  document.getElementById("sbName").textContent  = data.name || "Student";
  document.getElementById("sbClass").textContent = data.studentClass || "--";
  if (data.profileImage) {
    ["sbProfileImg","profilePreview","topbarImg"].forEach(id => {
      document.getElementById(id).src = data.profileImage;
    });
  }

  // Topbar
  document.getElementById("topbarName").textContent = (data.name || "Student").split(" ")[0];

  // School banner
  const school = data.school || "Your School";
  document.getElementById("schoolBannerName").textContent = school;
  
// Load school logo
const slug = school.toLowerCase().replace(/\s+/g, "_");
getDoc(doc(db, "schoolSettings", slug)).then(snap => {
  const logoEl = document.getElementById("schoolLogoEl");
  if (!logoEl) return;
  if (snap.exists() && snap.data().logoUrl) {
    logoEl.innerHTML = `<img src="${snap.data().logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
  } else {
    logoEl.textContent = school[0].toUpperCase();
  }
}).catch(() => {
  const logoEl = document.getElementById("schoolLogoEl");
  if (logoEl) logoEl.textContent = school[0].toUpperCase();
});

  document.getElementById("schoolBannerDate").textContent =
    new Date().toLocaleDateString("en-NG", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  // Profile
  document.getElementById("profName").textContent    = data.name || "--";
  document.getElementById("profNameVal").textContent = data.name || "--";
  document.getElementById("profEmail").textContent   = data.email || "--";
  document.getElementById("profSchool").textContent  = data.school || "--";
  document.getElementById("profClass").textContent   = data.studentClass || "--";
}

/* ════════════════════════════════
   WELCOME MESSAGE
════════════════════════════════ */
function setWelcomeMessage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (studentData.name || "Student").split(" ")[0];
  document.getElementById("welcomeMsg").textContent = `${greeting}, ${firstName}! 👋`;
  document.getElementById("welcomeSub").textContent =
    `Here's your academic snapshot for ${new Date().toLocaleDateString("en-NG", { weekday:"long", month:"long", day:"numeric" })}.`;
}

/* ════════════════════════════════
   ANIMATED COUNTER
════════════════════════════════ */
function animateCount(elId, target, suffix = "", duration = 1000) {
  const el = document.getElementById(elId);
  if (!el) return;
  const start   = performance.now();
  const isFloat = String(target).includes(".");

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const val      = isFloat ? (eased * target).toFixed(1) : Math.round(eased * target);
    el.textContent = val + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/* ════════════════════════════════
   LOAD DASHBOARD
════════════════════════════════ */
async function loadDashboard() {
  if (!studentData) return;
  const cls = studentData.studentClass;
  const uid = studentData._uid;

  try {
    // ── Assignments due ──
    const aq    = query(collection(db, "assignments"), where("class", "==", cls));
    const aSnap = await getDocs(aq);

    // Check submitted ones
    const sqSnap = await getDocs(query(collection(db,"assignmentSubmissions"), where("studentId","==",uid)));
    const submittedIds = new Set(sqSnap.docs.map(d => d.data().assignmentId));
    const pending = aSnap.docs.filter(d => !submittedIds.has(d.id));

    animateCount("statAssignments", pending.length);
    document.getElementById("barAssignments").style.width = Math.min(pending.length * 10, 100) + "%";

    // ── Attendance ──
    const attendQ  = query(collection(db,"attendance"), where("class","==",cls));
    const attSnap  = await getDocs(attendQ);
    let total = 0, present = 0;
    attSnap.forEach(d => {
      const rec = d.data().records || {};
      total++;
      if (rec[uid] === "present") present++;
    });
    const rate = total > 0 ? Math.round(present / total * 100) : 0;
    animateCount("statAttendance", rate, "%");
    document.getElementById("barAttendance").style.width = rate + "%";

    // ── Scores / average ──
    const scQ    = query(collection(db,"scores"), where("studentId","==",uid));
    const scSnap = await getDocs(scQ);
    const subjects = new Set();
    let totalScore = 0, count = 0;
    const subjectScores = {};

    scSnap.forEach(d => {
      const sc = d.data();
      subjects.add(sc.subject);
      if (!subjectScores[sc.subject] || sc.savedAt > subjectScores[sc.subject].savedAt) {
        subjectScores[sc.subject] = sc;
      }
    });

    Object.values(subjectScores).forEach(sc => {
      totalScore += sc.total;
      count++;
    });

    const avg = count > 0 ? Math.round(totalScore / count) : 0;
    animateCount("statSubjects", subjects.size);
    animateCount("statAverage", avg, "%");
    document.getElementById("barSubjects").style.width    = Math.min(subjects.size * 10, 100) + "%";
    document.getElementById("barAverage").style.width     = avg + "%";

    // ── Subject performance bars ──
    const barsEl = document.getElementById("subjectBars");
    if (Object.keys(subjectScores).length === 0) {
      barsEl.innerHTML = `<p class="empty-msg">No results yet.</p>`;
    } else {
      const colors = ["#6ee7b7","#818cf8","#f472b6","#fb923c","#60a5fa","#fbbf24","#34d399","#a78bfa"];
      barsEl.innerHTML = "";
      let colorIdx = 0;
      for (const [subject, sc] of Object.entries(subjectScores)) {
        const color = colors[colorIdx++ % colors.length];
        const item  = document.createElement("div");
        item.className = "subject-bar-item";
        item.innerHTML = `
          <div class="subject-bar-meta">
            <span>${subject}</span>
            <span class="score">${sc.total}/100</span>
          </div>
          <div class="subject-bar-track">
            <div class="subject-bar-fill" style="width:0%;background:${color}" data-target="${sc.total}"></div>
          </div>`;
        barsEl.appendChild(item);
      }
      // Animate bars
      setTimeout(() => {
        barsEl.querySelectorAll(".subject-bar-fill").forEach(bar => {
          bar.style.width = bar.dataset.target + "%";
        });
      }, 100);
    }

    // ── Profile academic stats ──
    document.getElementById("profAttendance").textContent = rate + "%";
    document.getElementById("profAssignments").textContent = submittedIds.size;
    if (count > 0) {
      document.getElementById("profAvg").textContent = avg + "%";
      const best = Object.entries(subjectScores).sort((a,b) => b[1].total - a[1].total)[0];
      document.getElementById("profBest").textContent = best ? best[0] : "--";
    }

    // ── Upcoming assignments on dashboard ──
    const upcomingEl = document.getElementById("upcomingAssignments");
    if (pending.length === 0) {
      upcomingEl.innerHTML = `<p class="empty-msg">🎉 No pending assignments!</p>`;
    } else {
      upcomingEl.innerHTML = "";
      const colors2 = ["#6ee7b7","#818cf8","#f472b6","#fb923c"];
      pending.slice(0, 4).forEach((d, i) => {
        const a    = d.data();
        const due  = new Date(a.due);
        const now  = new Date();
        const diff = Math.ceil((due - now) / 86400000);
        const dueClass  = diff < 0 ? "due-late" : diff <= 2 ? "due-soon" : "due-normal";
        const dueLabel  = diff < 0 ? "Overdue" : diff === 0 ? "Due today" : `${diff}d left`;
        const item = document.createElement("div");
        item.className = "upcoming-item";
        item.onclick   = () => switchSection("assignments");
        item.innerHTML = `
          <div class="upcoming-dot" style="background:${colors2[i%4]}"></div>
          <div class="upcoming-info">
            <p class="upcoming-title">${a.title}</p>
            <p class="upcoming-meta">📚 ${a.subject} • 🏫 ${a.class}</p>
          </div>
          <span class="upcoming-due ${dueClass}">${dueLabel}</span>`;
        upcomingEl.appendChild(item);
      });
    }

    // ── Activity feed ──
    const actEl = document.getElementById("activityFeed");
    const activities = [];
    sqSnap.docs.forEach(d => {
      const s = d.data();
      activities.push({ icon:"📌", text:`Submitted <b>${s.assignmentTitle}</b>`, time: s.submittedAt?.toDate?.() });
    });
    scSnap.docs.slice(0,3).forEach(d => {
      const s = d.data();
      activities.push({ icon:"📊", text:`New score available: <b>${s.subject}</b> — ${s.total}/100`, time: s.savedAt?.toDate?.() });
    });
    activities.sort((a,b) => (b.time||0) - (a.time||0));

    if (activities.length === 0) {
      actEl.innerHTML = `<p class="empty-msg">No recent activity yet.</p>`;
    } else {
      actEl.innerHTML = "";
      activities.slice(0, 5).forEach(act => {
        const item = document.createElement("div");
        item.className = "activity-item";
        item.innerHTML = `
          <div class="activity-icon">${act.icon}</div>
          <div>
            <p class="activity-text">${act.text}</p>
            <p class="activity-time">${act.time ? act.time.toLocaleDateString("en-NG") : "Recently"}</p>
          </div>`;
        actEl.appendChild(item);
      });
    }

    // Notifications are handled by the realtime onSnapshot listener (startStudentNotifListener)
  } catch (err) { console.error("Dashboard load error:", err); }
}

/* ════════════════════════════════
   RESULTS
════════════════════════════════ */
async function loadResults() {
  if (!studentData) return;
  const term      = document.getElementById("resultsTermFilter").value;
  const container = document.getElementById("resultsContainer");
  const summary   = document.getElementById("resultsSummary");
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  summary.style.display = "none";

  try {
    const q    = query(collection(db,"scores"),
      where("studentId","==",studentData._uid),
      where("term","==",term));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `<p class="empty-msg">No results found for ${term}. Results will appear once your teachers submit scores.</p>`;
      return;
    }

    const scores = [];
    let grandTotal = 0;
    snap.forEach(d => {
      const sc = d.data();
      scores.push(sc);
      grandTotal += sc.total;
    });
    const avg = (grandTotal / scores.length).toFixed(1);

    // Summary pills — just average and subject count
    summary.style.display = "flex";
    document.getElementById("resAvg").textContent          = avg + "%";
    document.getElementById("resSubjectCount").textContent = scores.length;

    // Subject cards
    const colors = ["#6ee7b7","#818cf8","#f472b6","#fb923c","#60a5fa","#fbbf24","#34d399","#a78bfa"];
    container.innerHTML = "";
    scores.forEach((sc, i) => {
      const color = colors[i % colors.length];

      // Build CA display: sum + breakdown e.g. "35 (CA1=20, CA2=15)"
      const caConfig = sc.caConfig || [20, 20];
      const caSum = caConfig.reduce((s, _, idx) => s + (sc[`ca${idx}`] ?? 0), 0);
      const caBreakdown = caConfig.map((_, idx) => `CA${idx+1}: ${sc[`ca${idx}`] ?? "-"}`).join(" · ");

      const card = document.createElement("div");
      card.className = "result-subject-card";
      card.innerHTML = `
        <p class="result-subject-name">${sc.subject}</p>
        <div class="result-scores">
          <div class="result-score-item">
            <span class="result-score-label">CA</span>
            <span class="result-score-val" title="${caBreakdown}">${caSum}</span>
          </div>
          <div class="result-score-item">
            <span class="result-score-label">Exam</span>
            <span class="result-score-val">${sc.exam}</span>
          </div>
          <div class="result-score-item">
            <span class="result-score-label">Total</span>
            <span class="result-score-val">${sc.total}</span>
          </div>
          <span class="grade-badge grade-${sc.grade}">${sc.grade}</span>
        </div>
        <p style="font-size:10px;color:var(--text2);margin-top:4px">${caBreakdown}</p>
        <div class="result-bar-wrap">
          <div class="result-bar-track">
            <div class="result-bar-fill" style="width:0%;background:${color}" data-target="${sc.total}"></div>
          </div>
        </div>`;
      container.appendChild(card);
    });

    // Animate bars
    setTimeout(() => {
      container.querySelectorAll(".result-bar-fill").forEach(bar => {
        bar.style.width = bar.dataset.target + "%";
      });
    }, 100);

  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

document.getElementById("resultsTermFilter").addEventListener("change", loadResults);

/* ════════════════════════════════
   REPORT CARDS
════════════════════════════════ */
async function loadReportCards() {
  if (!studentData) return;
  const container = document.getElementById("reportCardsContainer");
  container.innerHTML = `<p class="empty-msg">Checking for report cards...</p>`;

  try {
    // Only show report cards the teacher has explicitly released
    const q    = query(collection(db,"savedReportCards"),
      where("studentId","==",studentData._uid),
      where("released","==",true));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `<p class="empty-msg">No report cards available yet. Your class teacher will send yours when ready.</p>`;
      return;
    }

    container.innerHTML = "";
    snap.forEach(d => {
      const r    = d.data();
      const item = document.createElement("div");
      item.className = "report-card-item";
      item.innerHTML = `
        <div class="report-card-info">
          <h4>📄 ${r.term} Report Card</h4>
          <p>${r.subjects?.length || 0} subjects • ${r.class} • Avg: ${r.average}% • Position: ${r.position}${ordinalSuffix(r.position)}/${r.totalStudents}</p>
          <p style="color:var(--text2);font-size:11px;margin-top:2px">Generated ${r.generatedAt?.toDate?.()?.toLocaleDateString("en-NG") || ""}</p>
        </div>
        <button class="download-report-btn" data-term="${r.term}">⬇ Download PDF</button>`;
      container.appendChild(item);
    });

    container.querySelectorAll(".download-report-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const match = snap.docs.find(d => d.data().term === btn.dataset.term);
        if (!match) { toast("Report not found.", "error"); return; }
        btn.textContent = "⏳ Generating..."; btn.disabled = true;
        try {
          await generateStudentPDF(btn.dataset.term, match.data());
        } finally {
          btn.textContent = "⬇ Download PDF"; btn.disabled = false;
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

function ordinalSuffix(n) {
  if (n===1) return "st"; if (n===2) return "nd"; if (n===3) return "rd"; return "th";
}

async function generateStudentPDF(term, reportData) {
  // reportData comes from the savedReportCards Firestore document
  const uid = studentData._uid;
  const cls = studentData.studentClass;

  try {
    const r = reportData;
    const subjects    = r.subjects   || [];
    const sampleCfg   = r.sampleCfg  || [20, 20];
    const grandTotal  = r.grandTotal  || 0;
    const avg         = r.average     || "0";
    const ordinal     = r.position===1?"1st":r.position===2?"2nd":r.position===3?"3rd":`${r.position}th`;
    const attStr      = r.totalDays > 0 ? `${r.present}/${r.totalDays} days` : "No record";
    const teacherRemark = r.remark   || "";
    const nextTerm    = r.nextTerm   || "To be announced";
    const school      = r.school     || studentData.school || "SmartSchool";

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
    const W = 210, H = 297;
    let y = 15;

    // Header
    pdf.setFillColor(15,17,23); pdf.rect(0,0,W,40,"F");
    pdf.setFillColor(110,231,183); pdf.roundedRect(14,8,24,24,4,4,"F");
    pdf.setTextColor(15,17,23); pdf.setFontSize(16); pdf.setFont("helvetica","bold"); pdf.text("S",26,23,{align:"center"});
    pdf.setTextColor(255,255,255); pdf.setFontSize(16); pdf.setFont("helvetica","bold"); pdf.text(school,45,17);
    pdf.setFontSize(9); pdf.setFont("helvetica","normal");
    pdf.text("Student Academic Report Card",45,24);
    pdf.text(`${term} | ${new Date().getFullYear()}`,45,30);
    y = 50;

    // Student info bar
    pdf.setFillColor(245,247,250); pdf.roundedRect(14,y,W-28,28,3,3,"F");
    pdf.setTextColor(100,100,120); pdf.setFontSize(8); pdf.setFont("helvetica","bold");
    pdf.text("STUDENT NAME",20,y+8); pdf.text("CLASS",90,y+8); pdf.text("TERM",130,y+8); pdf.text("POSITION",168,y+8);
    pdf.setTextColor(20,20,40); pdf.setFontSize(11); pdf.setFont("helvetica","bold");
    pdf.text(studentData.name||"--",20,y+18);
    pdf.setFontSize(10); pdf.text(cls,90,y+18); pdf.text(term,130,y+18);
    pdf.setTextColor(59,130,246); pdf.text(`${ordinal} / ${r.totalStudents||1}`,168,y+18);
    y += 36;

    // Score table header
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

    // Attendance + Next Term
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

    // Signatures — fetch teacher sig from their user doc
    async function embedImg(url, x, yp, mw, mh) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const b64 = await new Promise(rv => { const fr = new FileReader(); fr.onload = () => rv(fr.result); fr.readAsDataURL(blob); });
        pdf.addImage(b64, blob.type.includes("png")?"PNG":"JPEG", x, yp, mw, mh, undefined, "FAST");
      } catch {}
    }

    // Load teacher and school settings for signatures
    let tSig = null, pSig = null, pTitle = "Principal";
    try {
      const tSnap = await getDoc(doc(db,"users", r.teacherId));
      if (tSnap.exists()) tSig = tSnap.data().signature || null;
      if (school) {
        const slug = school.toLowerCase().replace(/\s+/g,"_");
        const sSnap = await getDoc(doc(db,"schoolSettings",slug));
        if (sSnap.exists()) { pSig = sSnap.data().principalSignature||null; pTitle = sSnap.data().principalTitle||"Principal"; }
      }
    } catch {}

    pdf.setFillColor(250,250,252); pdf.roundedRect(14,y,85,32,3,3,"F");
    if (tSig) await embedImg(tSig,18,y+2,77,20);
    pdf.setDrawColor(180,180,200); pdf.setLineWidth(0.3); pdf.line(18,y+25,90,y+25);
    pdf.setTextColor(100,100,120); pdf.setFontSize(8); pdf.setFont("helvetica","normal");
    pdf.text("Class Teacher's Signature",50,y+30,{align:"center"});

    pdf.setFillColor(250,250,252); pdf.roundedRect(104,y,92,32,3,3,"F");
    if (pSig) await embedImg(pSig,108,y+2,84,20);
    pdf.line(108,y+25,W-16,y+25);
    pdf.text(`${pTitle}'s Signature`,W-50,y+30,{align:"center"});
    y += 40;

    // Footer
    pdf.setFillColor(15,17,23); pdf.rect(0,H-12,W,12,"F");
    pdf.setTextColor(155,163,184); pdf.setFontSize(7);
    pdf.text(`Generated by SmartSchool • ${school} • ${new Date().toLocaleDateString()}`,W/2,H-5,{align:"center"});

    pdf.save(`${(studentData.name||"Report").replace(/ /g,"_")}_${term.replace(/ /g,"_")}_ReportCard.pdf`);
    toast("Report card downloaded!", "success");
  } catch (err) { toast("Failed to generate PDF: " + err.message, "error"); console.error(err); }
}

/* ════════════════════════════════
   ATTENDANCE
════════════════════════════════ */
// Set default month to current
const today = new Date();
document.getElementById("attendMonthFilter").value =
  `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;

document.getElementById("loadAttendBtn").addEventListener("click", loadAttendance);

async function loadAttendance() {
  if (!studentData) return;
  const monthVal  = document.getElementById("attendMonthFilter").value;
  const calEl     = document.getElementById("attendCalendar");
  const summaryEl = document.getElementById("attendSummary");

  if (!monthVal) { toast("Select a month first.", "warning"); return; }

  const [year, month] = monthVal.split("-").map(Number);
  calEl.innerHTML = `<p class="empty-msg">Loading...</p>`;

  try {
    const cls = studentData.studentClass;
    const uid = studentData._uid;

    // Get all attendance records for this class in this month
    const q    = query(collection(db,"attendance"), where("class","==",cls));
    const snap = await getDocs(q);

    // Filter to this month
    const monthStr  = `${year}${String(month).padStart(2,"0")}`;
    const records   = {};
    let present=0, absent=0;

    snap.forEach(d => {
      const data = d.data();
      if (!data.date) return;
      const dateStr = data.date.replace(/-/g,"");
      if (!dateStr.startsWith(monthStr)) return;
      const day    = parseInt(data.date.split("-")[2]);
      const status = data.records?.[uid];
      if (status) {
        records[day] = status;
        if (status === "present") present++;
        else absent++;
      }
    });

    // Summary
    const total = present + absent;
    const rate  = total > 0 ? Math.round(present/total*100) : 0;
    summaryEl.style.display = "flex";
    document.getElementById("presentCount").textContent = present;
    document.getElementById("absentCount").textContent  = absent;
    document.getElementById("attendRate").textContent   = rate + "%";

    // Build calendar
    const firstDay   = new Date(year, month-1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayDay   = today.getFullYear()===year && today.getMonth()===month-1 ? today.getDate() : -1;
    const monthName  = new Date(year, month-1).toLocaleDateString("en-NG", {month:"long", year:"numeric"});

    calEl.innerHTML = `
      <div class="cal-header">
        <span class="cal-month-name">${monthName}</span>
      </div>
      <div class="cal-grid" id="calGrid">
        <div class="cal-day-name">Sun</div>
        <div class="cal-day-name">Mon</div>
        <div class="cal-day-name">Tue</div>
        <div class="cal-day-name">Wed</div>
        <div class="cal-day-name">Thu</div>
        <div class="cal-day-name">Fri</div>
        <div class="cal-day-name">Sat</div>
      </div>`;

    const grid = document.getElementById("calGrid");

    // Empty cells before first day
    for (let i=0; i<firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-day empty";
      grid.appendChild(empty);
    }

    for (let d=1; d<=daysInMonth; d++) {
      const cell = document.createElement("div");
      cell.className = "cal-day";
      cell.textContent = d;
      if (records[d] === "present") cell.classList.add("present");
      else if (records[d] === "absent") cell.classList.add("absent");
      if (d === todayDay) cell.classList.add("today");
      // Add tooltip
      if (records[d]) {
        cell.title = records[d] === "present" ? "Present ✅" : "Absent ❌";
      }
      grid.appendChild(cell);
    }

  } catch (err) {
    calEl.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

/* ════════════════════════════════
   ASSIGNMENTS
════════════════════════════════ */
async function loadAssignments() {
  if (!studentData) return;
  const cls = studentData.studentClass;
  const uid = studentData._uid;
  const pendingEl   = document.getElementById("pendingAssignments");
  const submittedEl = document.getElementById("submittedAssignments");
  pendingEl.innerHTML   = `<p class="empty-msg">Loading...</p>`;
  submittedEl.innerHTML = `<p class="empty-msg">Loading...</p>`;

  try {
    const [aSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db,"assignments"), where("school","==",studentData.school), where("class","==",cls))),
      getDocs(query(collection(db,"assignmentSubmissions"), where("studentId","==",uid)))
    ]);

    const submittedMap = {};
    sSnap.forEach(d => { submittedMap[d.data().assignmentId] = d.data(); });

    const now = new Date();
    const pending   = [];
    const submitted = [];

    aSnap.forEach(d => {
      const a = { id: d.id, ...d.data() };
      if (submittedMap[d.id]) {
        submitted.push({ ...a, submission: submittedMap[d.id] });
      } else {
        pending.push(a);
      }
    });

    // ── Pending — grouped by term ──
    if (pending.length === 0) {
      pendingEl.innerHTML = `<p class="empty-msg">🎉 You're all caught up! No pending assignments.</p>`;
    } else {
      pendingEl.innerHTML = "";
      const termGroups = { "1st Term": [], "2nd Term": [], "3rd Term": [], "Other": [] };
      pending.forEach(a => {
        const key = termGroups[a.term] ? a.term : "Other";
        termGroups[key].push(a);
      });

      for (const [term, list] of Object.entries(termGroups)) {
        if (list.length === 0) continue;
        const group = document.createElement("div");
        group.style.marginBottom = "16px";
        group.innerHTML = `
          <div class="assign-term-header" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-radius:10px;cursor:pointer;margin-bottom:10px">
            <span style="font-size:13px;font-weight:700">📅 ${term}</span>
            <span style="font-size:12px;color:var(--text2)">${list.length} pending <span class="t-chev">▼</span></span>
          </div>
          <div class="t-body"></div>`;
        pendingEl.appendChild(group);

        const body = group.querySelector(".t-body");
        list.forEach(a => body.appendChild(buildStudentAssignCard(a, now, uid)));

        group.querySelector(".assign-term-header").addEventListener("click", () => {
          const isHidden = body.style.display === "none";
          body.style.display = isHidden ? "block" : "none";
          group.querySelector(".t-chev").textContent = isHidden ? "▼" : "▶";
        });
      }
    }

    // ── Submitted — grouped by term ──
    if (submitted.length === 0) {
      submittedEl.innerHTML = `<p class="empty-msg">No submitted assignments yet.</p>`;
    } else {
      submittedEl.innerHTML = "";
      const termGroups = { "1st Term": [], "2nd Term": [], "3rd Term": [], "Other": [] };
      submitted.forEach(a => {
        const key = termGroups[a.term] ? a.term : "Other";
        termGroups[key].push(a);
      });

      for (const [term, list] of Object.entries(termGroups)) {
        if (list.length === 0) continue;
        const group = document.createElement("div");
        group.style.marginBottom = "16px";
        group.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📅 ${term}</div>`;
        list.forEach(a => {
          const sub  = a.submission;
          const card = document.createElement("div");
          card.className = "submitted-card";
          const graded = sub.grade !== undefined && sub.grade !== null;
          card.innerHTML = `
            <div class="submitted-info" style="flex:1">
              <h4>✅ ${a.title}</h4>
              <p>📚 ${a.subject} • Submitted ${sub.submittedAt?.toDate?.()?.toLocaleDateString("en-NG")||"Recently"}</p>
              ${graded
                ? `<p style="margin-top:6px;font-size:13px;color:#4ade80;font-weight:700">
                    ✏️ Graded: ${sub.grade}/100${sub.remark ? ` — "${sub.remark}"` : ""}
                   </p>`
                : `<p style="margin-top:4px;font-size:12px;color:#fb923c">⏳ Awaiting grade</p>`
              }
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${sub.fileUrl ? `<a href="${sub.fileUrl}" target="_blank" class="action-btn" style="text-decoration:none;font-size:12px">📎 View File</a>` : ""}
            </div>`;
          group.appendChild(card);
        });
        submittedEl.appendChild(group);
      }
    }

  } catch (err) {
    pendingEl.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

function buildStudentAssignCard(a, now, uid) {
  const due     = a.due ? new Date(a.due) : null;
  const overdue = due && due < now;
  const closed  = a.closed;

  // Deadline locked = closed by teacher OR past deadline with deadline set
  const locked = closed || (due && overdue);
  const diff   = due ? Math.ceil((due - now) / 86400000) : null;

  let dueLabel, dueClass;
  if (!due)          { dueLabel = "No deadline";   dueClass = "due-normal"; }
  else if (overdue)  { dueLabel = "⚠️ Overdue";    dueClass = "due-late";   }
  else if (diff <= 2){ dueLabel = `⏰ ${diff}d left`; dueClass = "due-soon"; }
  else               { dueLabel = `📅 ${a.due?.split("T")[0] || a.due}`; dueClass = "due-normal"; }

  const card = document.createElement("div");
  card.className = "assign-card";
  card.innerHTML = `
    <div class="assign-card-header">
      <div class="assign-card-left">
        <p class="assign-card-title">${a.title}</p>
        <div class="assign-card-meta">
          <span>📚 ${a.subject}</span>
          <span class="upcoming-due ${dueClass}">${dueLabel}</span>
          <span>👤 ${a.teacherName||"Teacher"}</span>
        </div>
      </div>
      <div class="assign-card-right">
        ${locked
          ? `<span class="assign-status-badge status-late">🔒 Closed</span>`
          : `<span class="assign-status-badge status-pending">Pending</span>`
        }
        <span class="assign-chevron">▼</span>
      </div>
    </div>
    <div class="assign-card-body">
      <p class="assign-desc">${a.description || "No description provided."}</p>
      ${locked
        ? `<div style="padding:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;font-size:13px;color:#f87171">
             🔒 Submissions are closed for this assignment.
           </div>`
        : `<div class="submit-area">
            <div class="field-group">
              <label>Your Answer <span style="color:var(--text2);font-size:10px">(optional if uploading)</span></label>
              <textarea class="submit-text-input" placeholder="Type your answer here..." rows="3"></textarea>
            </div>
            <div class="field-group">
              <label>Upload File <span style="color:var(--text2);font-size:10px">(optional if typing)</span></label>
              <input type="file" class="submit-file-input styled-input" accept=".pdf,.doc,.docx,.jpg,.png,.txt">
            </div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <button class="submit-btn-main do-submit-btn"
                data-id="${a.id}" data-title="${a.title}" data-teacher="${a.teacherId}">
                📬 Submit Assignment
              </button>
              <span class="submit-progress" style="font-size:12px;color:var(--text2)"></span>
            </div>
          </div>`
      }
    </div>`;

  card.querySelector(".assign-card-header").addEventListener("click", () => {
    card.classList.toggle("expanded");
  });

  if (!locked) {
    card.querySelector(".do-submit-btn")?.addEventListener("click", async e => {
      e.stopPropagation();
      const btn      = e.currentTarget;
      const textVal  = card.querySelector(".submit-text-input").value.trim();
      const fileVal  = card.querySelector(".submit-file-input").files[0];
      const progress = card.querySelector(".submit-progress");

      if (!textVal && !fileVal) { toast("Please type an answer or upload a file.", "warning"); return; }

      btn.disabled = true; btn.textContent = "Submitting...";
      progress.textContent = "⏳ Saving...";

      try {
        let fileUrl = "", fileName = "";
        if (fileVal) {
          progress.textContent = "⏳ Uploading file...";
          const liveUid2 = auth.currentUser?.uid || studentData._uid;
          const safeFileName = fileVal.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileRef = ref(storage, `submissions/${liveUid2}/${Date.now()}_${safeFileName}`);
          const task    = uploadBytesResumable(fileRef, fileVal, { contentType: fileVal.type });
          await new Promise((res, rej) => {
            task.on("state_changed",
              s => { progress.textContent = `⏳ ${Math.round(s.bytesTransferred/s.totalBytes*100)}%`; },
              rej,
              async () => { fileUrl = await getDownloadURL(task.snapshot.ref); fileName = fileVal.name; res(); }
            );
          });
        }

        await addDoc(collection(db,"assignmentSubmissions"), {
          assignmentId:    a.id,
          assignmentTitle: a.title,
          teacherId:       a.teacherId,
          studentId:       studentData._uid,
          studentName:     studentData.name,
          class:           studentData.studentClass,
          term:            a.term || "",
          textAnswer:      textVal,
          fileUrl, fileName,
          submittedAt: serverTimestamp()
        });

        // Notify the teacher
        if (a.teacherId) {
          await addDoc(collection(db,"notifications"), {
            userId:    a.teacherId,
            type:      "submission",
            message:   `📌 ${studentData.name} submitted "${a.title}" (${studentData.studentClass})`,
            read:      false,
            createdAt: serverTimestamp()
          });
        }

        toast(`✅ "${a.title}" submitted!`, "success");
        loadAssignments();
      } catch (err) {
        toast("Submission failed: " + err.message, "error");
        btn.disabled = false; btn.textContent = "📬 Submit Assignment";
        progress.textContent = "";
      }
    });
  }

  return card;
}

// Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

/* ════════════════════════════════
   RESOURCES
════════════════════════════════ */
async function loadResources() {
  if (!studentData) return;
  const cls       = studentData.studentClass;
  const container = document.getElementById("resourcesContainer");
  const subFilter = document.getElementById("resourceSubjectFilter");
  container.innerHTML = `<p class="empty-msg">Loading resources...</p>`;

  try {
    const q    = query(collection(db,"resources"), where("class","==",cls));
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `<p class="empty-msg">No resources uploaded yet. Check back soon!</p>`;
      return;
    }

    // Build subject filter options
    const subjects = new Set();
    snap.forEach(d => subjects.add(d.data().subject));
    subFilter.innerHTML = `<option value="">All Subjects</option>`;
    subjects.forEach(s => subFilter.innerHTML += `<option value="${s}">${s}</option>`);

    const renderResources = (filterSubject = "") => {
      container.innerHTML = "";
      const fileIcons = {
        pdf: "📕", doc: "📘", docx: "📘",
        ppt: "📙", pptx: "📙",
        jpg: "🖼️", png: "🖼️",
        default: "📄"
      };
      let shown = 0;
      snap.forEach(d => {
        const r = d.data();
        if (filterSubject && r.subject !== filterSubject) return;
        const ext  = (r.fileName||"").split(".").pop().toLowerCase();
        const icon = fileIcons[ext] || fileIcons.default;
        const card = document.createElement("div");
        card.className = "resource-card";
        card.innerHTML = `
          <div class="resource-icon">${icon}</div>
          <p class="resource-title">${r.title}</p>
          <p class="resource-meta">📚 ${r.subject} • ${r.fileName||""}</p>
          <a href="${r.fileUrl}" target="_blank" class="resource-download">⬇ Download</a>`;
        container.appendChild(card);
        shown++;
      });
      if (shown === 0) container.innerHTML = `<p class="empty-msg">No resources for this subject.</p>`;
    };

    renderResources();
    subFilter.addEventListener("change", () => renderResources(subFilter.value));

  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

/* ════════════════════════════════
   PROFILE IMAGE UPLOAD
════════════════════════════════ */
document.getElementById("profileUpload").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const user = auth.currentUser;
  if (!user) return;
  if (file.size > 5*1024*1024) { toast("Max 5MB image.", "warning"); return; }

  const statusEl = document.getElementById("uploadStatus");
  statusEl.style.display = "block";
  statusEl.style.color   = "#4ade80";
  statusEl.textContent   = "⏳ Uploading...";

  try {
    const fileRef    = ref(storage, `profileImages/${user.uid}`);
    const uploadTask = uploadBytesResumable(fileRef, file, { contentType: file.type });
    uploadTask.on("state_changed",
      s  => { statusEl.textContent = `⏳ ${Math.round(s.bytesTransferred/s.totalBytes*100)}%`; },
      err => { statusEl.textContent = "❌ "+err.message; statusEl.style.color="#ef4444"; },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        await setDoc(doc(db,"users",user.uid), { profileImage: url }, { merge:true });
        ["sbProfileImg","profilePreview","topbarImg"].forEach(id => document.getElementById(id).src = url);
        statusEl.textContent = "✅ Updated!";
        toast("Profile photo updated!", "success");
        setTimeout(() => statusEl.style.display="none", 3000);
      }
    );
  } catch (err) { statusEl.textContent="❌ "+err.message; statusEl.style.color="#ef4444"; }
});

/* ════════════════════════════════
   LOGOUT
════════════════════════════════ */
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "student-login.html";
});