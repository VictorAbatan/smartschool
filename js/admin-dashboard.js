import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection,
  query, where, getDocs, onSnapshot, serverTimestamp, orderBy, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, uploadBytes,
  getDownloadURL, deleteObject
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

let adminData  = null;
let schoolData = null;
let unsubNotif = null;

/* ════════════════════════════════
   TOAST
════════════════════════════════ */
function toast(msg, type = "info", duration = 3500) {
  const icons = { success:"✅", error:"❌", info:"ℹ️", warning:"⚠️" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 350); }, duration);
}

/* ════════════════════════════════
   THEME (dark / light)
════════════════════════════════ */
const themeBtn = document.getElementById("themeToggleBtn");
let darkMode = localStorage.getItem("adminTheme") !== "light";

function applyTheme() {
  document.body.classList.toggle("light-mode", !darkMode);
  if (themeBtn) themeBtn.textContent = darkMode ? "🌙" : "☀️";
  localStorage.setItem("adminTheme", darkMode ? "dark" : "light");
}
applyTheme();

themeBtn?.addEventListener("click", () => { darkMode = !darkMode; applyTheme(); });

/* ════════════════════════════════
   SIDEBAR & NAV
════════════════════════════════ */
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

document.querySelectorAll(".nav-item[data-section]").forEach(item => {
  item.addEventListener("click", () => {
    const target = item.dataset.section;
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    item.classList.add("active");
    document.getElementById(target)?.classList.add("active");
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
    if (target === "sec-teachers") loadTeachers();
    if (target === "sec-students") loadStudents();
    if (target === "sec-settings") loadSettings();
  });
});

/* ════════════════════════════════
   NOTIFICATIONS
════════════════════════════════ */
const notifBtn      = document.getElementById("notifBtn");
const notifPanel    = document.getElementById("notifPanel");
const notifBadge    = document.getElementById("notifBadge");
const notifList     = document.getElementById("notifList");
const markAllBtn    = document.getElementById("markAllReadBtn");
const notifWrapper  = document.getElementById("notifWrapper");

// Toggle panel
notifBtn?.addEventListener("click", e => {
  e.stopPropagation();
  const open = notifPanel.style.display === "block";
  notifPanel.style.display = open ? "none" : "block";
});
document.addEventListener("click", e => {
  if (!notifWrapper?.contains(e.target)) notifPanel.style.display = "none";
});

function startNotifListener(school) {
  if (unsubNotif) unsubNotif();
  // Listen to adminNotifications collection for this school
  const q = query(
    collection(db, "adminNotifications"),
    where("school", "==", school),
    where("read", "==", false)
  );
  unsubNotif = onSnapshot(q, snap => {
    const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    notifs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    // Badge
    if (notifs.length > 0) {
      notifBadge.textContent = notifs.length > 9 ? "9+" : notifs.length;
      notifBadge.style.display = "flex";
    } else {
      notifBadge.style.display = "none";
    }

    // Panel list
    if (notifs.length === 0) {
      notifList.innerHTML = `<p style="padding:16px;font-size:13px;color:var(--text2)">No new notifications</p>`;
      return;
    }
    notifList.innerHTML = "";
    notifs.forEach(n => {
      const item = document.createElement("div");
      item.className = "notif-item";
      const timeStr = n.createdAt?.toDate?.()?.toLocaleString("en-NG", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) || "";
      item.innerHTML = `
        <div class="notif-item-body">
          <span class="notif-icon">${n.icon || "🔔"}</span>
          <div class="notif-text">
            <p class="notif-msg">${n.message}</p>
            <p class="notif-time">${timeStr}</p>
          </div>
        </div>
        <button class="notif-dismiss" data-id="${n.id}" title="Dismiss">✕</button>`;
      item.querySelector(".notif-dismiss").addEventListener("click", async () => {
        await updateDoc(doc(db, "adminNotifications", n.id), { read: true });
      });
      notifList.appendChild(item);
    });
  }, err => console.error("Notif listener:", err));
}

markAllBtn?.addEventListener("click", async () => {
  const q = query(collection(db,"adminNotifications"), where("school","==",adminData.school), where("read","==",false));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => updateDoc(doc(db,"adminNotifications",d.id), { read: true })));
});

/* ════════════════════════════════
   AUTH GUARD
════════════════════════════════ */
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "teacher-login.html"; return; }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "admin") {
    window.location.href = "teacher-login.html"; return;
  }

  adminData = { ...snap.data(), _uid: user.uid };

  const slug = adminData.schoolSlug;
  if (slug) {
    const sSnap = await getDoc(doc(db, "schoolSettings", slug));
    if (sSnap.exists()) schoolData = sSnap.data();
  }

  fillUI();
  loadOverview();
  startNotifListener(adminData.school);
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if (unsubNotif) unsubNotif();
  await signOut(auth);
  window.location.href = "teacher-login.html";
});

/* ════════════════════════════════
   FILL UI
════════════════════════════════ */
function fillUI() {
  const school  = adminData.school || "Your School";
  const name    = adminData.name   || "Principal";
  const initial = school[0].toUpperCase();

  document.getElementById("sbName").textContent        = name;
  document.getElementById("sbSchoolName").textContent  = school;
  // sbLogoFallback is now the SmartSchool SVG icon — no textContent update needed

  document.getElementById("schoolBannerName").textContent   = school;
  // topbarLogoFallback is now an SVG img — no textContent needed
  document.getElementById("topbarPrincipalName").textContent = name;
  document.getElementById("topbarDate").textContent =
    new Date().toLocaleDateString("en-NG", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  const settingsCode = document.getElementById("settingsAdminCode");
  if (settingsCode) settingsCode.textContent = schoolData?.adminCode || "——";

  document.getElementById("welcomeMsg").textContent =
    `Welcome back, ${name.split(" ")[0]}. Here's what's happening at ${school}.`;

  if (schoolData?.logoUrl) applySchoolLogo(schoolData.logoUrl);
  if (adminData.photoURL)  applyPrincipalPhoto(adminData.photoURL);
}

/* ════════════════════════════════
   LOGO & PHOTO HELPERS
════════════════════════════════ */
function applySchoolLogo(url) {
  const sbImg      = document.getElementById("sbLogoImg");
  const sbFallback = document.getElementById("sbLogoFallback");
  const tbImg      = document.getElementById("topbarLogoImg");
  const tbFallback = document.getElementById("topbarLogoFallback");
  const setImg     = document.getElementById("logoPreviewImg");
  const setHolder  = document.getElementById("logoUploadPlaceholder");

  if (url) {
    if (sbImg)      { sbImg.src = url; sbImg.style.display = "block"; }
    if (sbFallback)   sbFallback.style.display = "none";
    if (tbImg)      { tbImg.src = url; tbImg.style.display = "block"; }
    if (tbFallback)   tbFallback.style.display = "none";
    if (setImg)     { setImg.src = url; setImg.style.display = "block"; }
    if (setHolder)    setHolder.style.display = "none";
    const removeBtn = document.getElementById("removeLogoBtn");
    if (removeBtn) removeBtn.style.display = "";
  } else {
    if (sbImg)      sbImg.style.display = "none";
    if (sbFallback) sbFallback.style.display = "";
    if (tbImg)      tbImg.style.display = "none";
    if (tbFallback) tbFallback.style.display = "";
    if (setImg)     setImg.style.display = "none";
    if (setHolder)  setHolder.style.display = "";
    const removeBtn = document.getElementById("removeLogoBtn");
    if (removeBtn) removeBtn.style.display = "none";
  }
}

function applyPrincipalPhoto(url) {
  if (!url) return;
  ["sbProfileImg","topbarPrincipalImg","principalPhotoPreview"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = url;
  });
}

/* ════════════════════════════════
   OVERVIEW
════════════════════════════════ */
async function loadOverview() {
  if (!adminData) return;
  const school = adminData.school;
  try {
    const [teachersSnap, studentsSnap, assignSnap, reportsSnap] = await Promise.all([
      getDocs(query(collection(db,"users"), where("school","==",school), where("role","==","teacher"))),
      getDocs(query(collection(db,"users"), where("school","==",school), where("role","==","student"))),
      getDocs(query(collection(db,"assignments"), where("school","==",school))),
      getDocs(query(collection(db,"savedReportCards"), where("school","==",school)))
    ]);

    document.getElementById("statTeachers").textContent    = teachersSnap.size;
    document.getElementById("statStudents").textContent    = studentsSnap.size;
    document.getElementById("statAssignments").textContent = assignSnap.size;
    document.getElementById("statReports").textContent     = reportsSnap.size;

    // Populate class filters
    const classes = new Set();
    studentsSnap.forEach(d => { if (d.data().studentClass) classes.add(d.data().studentClass); });
    const sortedClasses = [...classes].sort();
    ["studentClassFilter"].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sortedClasses.forEach(c => {
        if (!sel.querySelector(`option[value="${c}"]`))
          sel.innerHTML += `<option value="${c}">${c}</option>`;
      });
    });

    // Recent activity
    const actEl = document.getElementById("recentActivity");
    const activity = [];
    reportsSnap.docs.slice(-5).forEach(d => {
      const r = d.data();
      activity.push({ time: r.generatedAt?.toDate?.() || new Date(0), text: `📄 Report card generated for ${r.studentName} (${r.class}) — ${r.term}` });
    });
    assignSnap.docs.slice(-5).forEach(d => {
      const a = d.data();
      activity.push({ time: a.createdAt?.toDate?.() || new Date(0), text: `📌 Assignment "${a.title}" created for ${a.class} — ${a.subject}` });
    });
    activity.sort((a, b) => b.time - a.time);

    if (activity.length === 0) {
      actEl.innerHTML = `<p class="empty-msg">No recent activity yet.</p>`;
    } else {
      actEl.innerHTML = "";
      activity.slice(0, 8).forEach(a => {
        const item = document.createElement("div");
        item.style.cssText = "display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--card-border)";
        item.innerHTML = `
          <span style="font-size:11px;color:var(--text2);flex-shrink:0;margin-top:2px;min-width:80px">
            ${a.time > new Date(1000) ? a.time.toLocaleDateString("en-NG") : "—"}
          </span>
          <span style="font-size:13px;color:var(--text)">${a.text}</span>`;
        actEl.appendChild(item);
      });
    }
  } catch (err) { console.error("Overview error:", err); }
  clearOldActivity();
}


/* ════════════════════════════════
   WEEKLY ACTIVITY CLEAR
   Wipes adminNotifications (read=true) older than 7 days
   and savedReportCards activity older than 7 days from recentActivity view
════════════════════════════════ */
async function clearOldActivity() {
  if (!adminData) return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    // Clear read notifications older than 7 days
    const oldNotifs = await getDocs(query(
      collection(db, "adminNotifications"),
      where("school", "==", adminData.school),
      where("read",   "==", true)
    ));
    const toDelete = oldNotifs.docs.filter(d => {
      const t = d.data().createdAt?.toDate?.();
      return t && t < cutoff;
    });
    await Promise.all(toDelete.map(d => deleteDoc(doc(db, "adminNotifications", d.id))));
    if (toDelete.length) console.log(`Cleared ${toDelete.length} old notifications`);
  } catch (err) { console.error("clearOldActivity:", err); }
}

/* ════════════════════════════════
   COPY / REGEN CODE
════════════════════════════════ */
function copyCode(btnId) {
  const code = schoolData?.adminCode || "";
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById(btnId);
    if (btn) { btn.textContent = "✅ Copied!"; setTimeout(() => btn.textContent = "📋 Copy", 2000); }
  });
}
document.getElementById("copyCodeBtn2")?.addEventListener("click", () => copyCode("copyCodeBtn2"));

/* ════════════════════════════════
   TEACHERS
════════════════════════════════ */
async function loadTeachers() {
  const container = document.getElementById("teachersList");
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  try {
    const snap = await getDocs(query(collection(db,"users"), where("school","==",adminData.school), where("role","==","teacher")));
    if (snap.empty) { container.innerHTML = `<p class="empty-msg">No teachers registered yet.</p>`; return; }

    const teachers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    teachers.sort((a, b) => (a.name||"").localeCompare(b.name||""));
    renderTeachers(teachers, container);

    const searchEl = document.getElementById("teacherSearch");
    if (searchEl && !searchEl._listenerAdded) {
      searchEl._listenerAdded = true;
      searchEl.addEventListener("input", e => {
        const q = e.target.value.toLowerCase();
        renderTeachers(teachers.filter(t =>
          (t.name||"").toLowerCase().includes(q) ||
          (t.email||"").toLowerCase().includes(q) ||
          (t.mainClass||"").toLowerCase().includes(q)), container);
      });
    }
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
}

function renderTeachers(list, container) {
  if (list.length === 0) { container.innerHTML = `<p class="empty-msg">No teachers found.</p>`; return; }
  container.innerHTML = "";
  list.forEach(t => {
    const card     = document.createElement("div");
    card.className = "person-card";
    const isClass  = t.teacherType === "both";
    const initials = (t.name||"T").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
    card.innerHTML = `
      <img src="${t.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&backgroundColor=6ee7b7&fontFamily=Arial`}" class="person-avatar" alt="${t.name}">
      <div class="person-info">
        <p class="person-name">${t.name || "—"}</p>
        <p class="person-meta">${t.email || "—"}</p>
        <div class="person-badges">
          <span class="person-badge ${isClass ? "gold" : "blue"}">${isClass ? "Class Teacher" : "Subject Teacher"}</span>
          ${isClass && t.mainClass ? `<span class="person-badge">Main: ${t.mainClass}</span>` : ""}
          ${(t.subjectsTaught||[]).map(s => `<span class="person-badge blue">${s}</span>`).join("")}
        </div>
      </div>`;
    container.appendChild(card);
  });
}

/* ════════════════════════════════
   STUDENTS
════════════════════════════════ */
async function loadStudents() {
  const container = document.getElementById("studentsList");
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;
  try {
    const snap = await getDocs(query(collection(db,"users"), where("school","==",adminData.school), where("role","==","student")));
    if (snap.empty) { container.innerHTML = `<p class="empty-msg">No students registered yet.</p>`; return; }

    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    students.sort((a, b) => (a.studentClass||"").localeCompare(b.studentClass||"") || (a.name||"").localeCompare(b.name||""));

    function renderStudents(list) {
      if (list.length === 0) { container.innerHTML = `<p class="empty-msg">No students found.</p>`; return; }
      container.innerHTML = "";
      list.forEach(s => {
        const card     = document.createElement("div");
        card.className = "person-card";
        const initials = (s.name||"S").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
        card.innerHTML = `
          <img src="${s.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&backgroundColor=818cf8&fontFamily=Arial`}" class="person-avatar" alt="${s.name}">
          <div class="person-info">
            <p class="person-name">${s.name || "—"}</p>
            <p class="person-meta">${s.email || "—"}</p>
            <div class="person-badges"><span class="person-badge blue">${s.studentClass || "No class"}</span></div>
          </div>`;
        container.appendChild(card);
      });
    }

    renderStudents(students);

    function applyFilters() {
      const cls = document.getElementById("studentClassFilter")?.value || "";
      const q   = (document.getElementById("studentSearch")?.value || "").toLowerCase();
      renderStudents(students.filter(s =>
        (!cls || s.studentClass === cls) &&
        (!q   || (s.name||"").toLowerCase().includes(q) || (s.email||"").toLowerCase().includes(q))));
    }

    const filterEl = document.getElementById("studentClassFilter");
    const searchEl = document.getElementById("studentSearch");
    if (filterEl && !filterEl._listenerAdded) { filterEl._listenerAdded = true; filterEl.addEventListener("change", applyFilters); }
    if (searchEl && !searchEl._listenerAdded) { searchEl._listenerAdded = true; searchEl.addEventListener("input",  applyFilters); }
  } catch (err) { container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`; }
}

/* ════════════════════════════════
   RESULTS — Class → Arm → Teacher → Students → Report Cards
════════════════════════════════ */
document.getElementById("loadResultsBtn")?.addEventListener("click", loadResults);

async function loadResults() {
  const term      = document.getElementById("resultsTermFilter")?.value || "1st Term";
  const container = document.getElementById("resultsContainer");
  container.innerHTML = `<p class="empty-msg">Loading...</p>`;

  try {
    // Fetch all report cards for this school + term
    const rcSnap = await getDocs(query(
      collection(db, "savedReportCards"),
      where("school", "==", adminData.school),
      where("term",   "==", term)
    ));

    if (rcSnap.empty) {
      container.innerHTML = `<p class="empty-msg">No report cards found for ${term}.</p>`; return;
    }

    // Fetch all students to get class + arm info
    const studSnap = await getDocs(query(
      collection(db,"users"), where("school","==",adminData.school), where("role","==","student")
    ));
    const studMap = {};
    studSnap.forEach(d => { studMap[d.id] = d.data(); });

    // Fetch all teachers to identify class teachers per class
    const teachSnap = await getDocs(query(
      collection(db,"users"), where("school","==",adminData.school), where("role","==","teacher"), where("teacherType","==","both")
    ));
    // Map mainClass → teacher name
    const classTeacherMap = {};
    teachSnap.forEach(d => {
      const t = d.data();
      if (t.mainClass) classTeacherMap[t.mainClass] = t.name || "—";
    });

    // Group report cards: classBase → arm → [reportCard]
    // classBase = e.g. "JSS1", arm = "JSS1A" → arm part = "A"
    // We derive arm from the full class string: "JSS1A" → base "JSS1", arm "A"
    function parseClass(cls) {
      if (!cls) return { base: "Unknown", arm: "" };
      // Match patterns like JSS1A, SS2B, Primary3C, etc.
      const m = cls.match(/^([A-Za-z]+\s*\d+)\s*([A-Za-z]*)$/);
      if (m) return { base: m[1].trim().toUpperCase(), arm: m[2].trim().toUpperCase() || "—" };
      return { base: cls.toUpperCase(), arm: "—" };
    }

    // Sort order for class bases
    const CLASS_ORDER = ["NURSERY","KG","KINDERGARTEN","PRIMARY","BASIC","JSS","SS","SSS","FORM"];
    function classBaseSort(a, b) {
      const rankA = CLASS_ORDER.findIndex(p => a.startsWith(p));
      const rankB = CLASS_ORDER.findIndex(p => b.startsWith(p));
      if (rankA !== rankB) return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
      return a.localeCompare(b);
    }

    // Structure: { "JSS1": { "A": [reports], "B": [reports] }, ... }
    const grouped = {};
    rcSnap.forEach(d => {
      const r = d.data();
      const { base, arm } = parseClass(r.class);
      if (!grouped[base]) grouped[base] = {};
      if (!grouped[base][arm]) grouped[base][arm] = [];
      grouped[base][arm].push({ id: d.id, ...r });
    });

    container.innerHTML = "";

    const sortedBases = Object.keys(grouped).sort(classBaseSort);

    sortedBases.forEach(base => {
      // Class level block
      const classBlock = document.createElement("div");
      classBlock.className = "results-class-block";

      const classHeader = document.createElement("div");
      classHeader.className = "results-level-header";
      classHeader.innerHTML = `
        <button class="results-collapse-btn" data-target="class-${base}">▼</button>
        <span class="results-level-title">📚 ${base}</span>
        <span class="results-level-count">${Object.values(grouped[base]).flat().length} report cards</span>`;
      classBlock.appendChild(classHeader);

      const classBody = document.createElement("div");
      classBody.id = `class-${base}`;
      classBody.className = "results-level-body";

      const sortedArms = Object.keys(grouped[base]).sort();

      sortedArms.forEach(arm => {
        const reports = grouped[base][arm];
        const fullClass = arm && arm !== "—" ? `${base}${arm}` : base;
        const classTeacher = classTeacherMap[fullClass] || classTeacherMap[`${base} ${arm}`] || "Not assigned";

        reports.sort((a, b) => (b.average || 0) - (a.average || 0));

        const armBlock = document.createElement("div");
        armBlock.className = "results-arm-block";

        armBlock.innerHTML = `
          <div class="results-arm-header">
            <button class="results-collapse-btn small" data-target="arm-${base}-${arm}">▼</button>
            <div class="results-arm-info">
              <span class="results-arm-title">${fullClass}</span>
              <span class="results-arm-teacher">👨‍🏫 Class Teacher: <strong>${classTeacher}</strong></span>
            </div>
            <span class="results-arm-count">${reports.length} students</span>
          </div>
          <div id="arm-${base}-${arm}" class="results-arm-body">
            <table class="rp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Avg</th>
                  <th>Position</th>
                  <th>Subjects</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${reports.map((r, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td style="font-weight:600">${r.studentName}</td>
                    <td style="color:var(--accent);font-weight:700">${r.average}%</td>
                    <td>${r.position ? `${r.position}${ordinal(r.position)}/${r.totalStudents}` : "—"}</td>
                    <td>${r.subjects?.length || 0}</td>
                    <td><span class="person-badge ${r.released ? "blue" : ""}">${r.released ? "Released" : "Pending"}</span></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;

        classBody.appendChild(armBlock);
      });

      classBlock.appendChild(classBody);
      container.appendChild(classBlock);
    });

    // Collapse toggle handlers
    container.querySelectorAll(".results-collapse-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const collapsed = target.style.display === "none";
        target.style.display = collapsed ? "" : "none";
        btn.textContent = collapsed ? "▼" : "▶";
      });
    });

  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
    console.error(err);
  }
}

function ordinal(n) {
  if (n === 1) return "st"; if (n === 2) return "nd"; if (n === 3) return "rd"; return "th";
}

/* ════════════════════════════════
   SETTINGS
════════════════════════════════ */
function loadSettings() {
  if (!adminData) return;
  const sn = document.getElementById("settingsSchoolName");
  const pn = document.getElementById("settingsPrincipalName");
  const pt = document.getElementById("settingsPrincipalTitle");
  if (sn) sn.value = adminData.school || "";
  if (pn) pn.value = adminData.name   || "";
  if (pt) pt.value = adminData.principalTitle || "Principal";

  if (schoolData?.principalSignature) {
    const wrap = document.getElementById("pSigSavedWrap");
    const img  = document.getElementById("pSigPreview");
    const rb   = document.getElementById("pRemoveSigBtn");
    if (wrap) wrap.style.display = "block";
    if (img)  img.src = schoolData.principalSignature;
    if (rb)   rb.style.display = "inline-block";
  }
  if (schoolData?.logoUrl) applySchoolLogo(schoolData.logoUrl);
  if (adminData.photoURL)  applyPrincipalPhoto(adminData.photoURL);

  initLogoUpload();
  initPhotoUpload();
  initPrincipalSignaturePad();
}

/* ════════════════════════════════
   LOGO UPLOAD
════════════════════════════════ */
function initLogoUpload() {
  const uploadBtn = document.getElementById("uploadLogoBtn");
  const removeBtn = document.getElementById("removeLogoBtn");
  const fileInput = document.getElementById("logoFileInput");
  const statusEl  = document.getElementById("logoUploadStatus");
  if (!uploadBtn || uploadBtn._initDone) return;
  uploadBtn._initDone = true;

  uploadBtn.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showStatus(statusEl, "❌ File too large (max 2 MB)", "#ef4444"); return; }
    showStatus(statusEl, "⏳ Uploading...", "var(--text2)");
    try {
      const slug       = adminData.schoolSlug;
      const storageRef = ref(storage, `schools/${slug}/logo`);
      const snapshot   = await uploadBytes(storageRef, file);
      const url        = await getDownloadURL(snapshot.ref);
      await setDoc(doc(db, "schoolSettings", slug), { logoUrl: url }, { merge: true });
      if (schoolData) schoolData.logoUrl = url;
      applySchoolLogo(url);
      showStatus(statusEl, "✅ Logo saved!", "#4ade80");
      toast("School logo updated!", "success");
    } catch (e) { showStatus(statusEl, "❌ Upload failed: " + e.message, "#ef4444"); toast("Logo upload failed.", "error"); }
    fileInput.value = "";
  });
  removeBtn?.addEventListener("click", async () => {
    if (!confirm("Remove school logo?")) return;
    try {
      const slug = adminData.schoolSlug;
      await deleteObject(ref(storage, `schools/${slug}/logo`)).catch(() => {});
      await setDoc(doc(db, "schoolSettings", slug), { logoUrl: "" }, { merge: true });
      if (schoolData) schoolData.logoUrl = "";
      applySchoolLogo(null);
      showStatus(statusEl, "Logo removed.", "var(--text2)");
      toast("School logo removed.", "info");
    } catch (e) { showStatus(statusEl, "❌ " + e.message, "#ef4444"); }
  });
}

/* ════════════════════════════════
   PHOTO UPLOAD
════════════════════════════════ */
function initPhotoUpload() {
  const triggerBtn = document.getElementById("triggerPhotoUpload");
  const fileInput  = document.getElementById("photoFileInput");
  const statusEl   = document.getElementById("photoUploadStatus");
  if (!triggerBtn || triggerBtn._initDone) return;
  triggerBtn._initDone = true;

  triggerBtn.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { showStatus(statusEl, "❌ File too large (max 3 MB)", "#ef4444"); return; }
    showStatus(statusEl, "⏳ Uploading...", "var(--text2)");
    try {
      const uid        = auth.currentUser.uid;
      const storageRef = ref(storage, `users/${uid}/photo`);
      const snapshot   = await uploadBytes(storageRef, file);
      const url        = await getDownloadURL(snapshot.ref);
      await setDoc(doc(db, "users", uid), { photoURL: url }, { merge: true });
      adminData.photoURL = url;
      applyPrincipalPhoto(url);
      showStatus(statusEl, "✅ Photo saved!", "#4ade80");
      toast("Profile photo updated!", "success");
    } catch (e) { showStatus(statusEl, "❌ Upload failed: " + e.message, "#ef4444"); toast("Photo upload failed.", "error"); }
    fileInput.value = "";
  });
}

/* ════════════════════════════════
   STATUS HELPER
════════════════════════════════ */
function showStatus(el, msg, color = "var(--text2)") {
  if (!el) return;
  el.textContent   = msg;
  el.style.color   = color;
  el.style.display = "block";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = "none"; }, 4000);
}

/* ════════════════════════════════
   SIGNATURE PAD
════════════════════════════════ */
function initPrincipalSignaturePad() {
  const canvas = document.getElementById("pSigCanvas");
  if (!canvas || canvas._padInit) return;
  canvas._padInit = true;

  function resizeCanvas() {
    const rect    = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }
  resizeCanvas();

  const ctx = canvas.getContext("2d");
  let drawing = false;
  const getPos = e => { const rect = canvas.getBoundingClientRect(); const src = e.touches ? e.touches[0] : e; return { x: src.clientX - rect.left, y: src.clientY - rect.top }; };

  canvas.addEventListener("mousedown",  e => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener("mousemove",  e => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener("mouseup",    () => drawing = false);
  canvas.addEventListener("mouseleave", () => drawing = false);
  canvas.addEventListener("touchstart", e => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener("touchmove",  e => { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  canvas.addEventListener("touchend",   () => drawing = false);

  document.getElementById("pClearSigBtn")?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
  });
}

document.getElementById("pSaveSigBtn")?.addEventListener("click", async () => {
  const canvas = document.getElementById("pSigCanvas");
  const user   = auth.currentUser;
  if (!canvas || !user) return;
  const ctx  = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!data.some(v => v !== 0)) { toast("Please draw your signature first.", "warning"); return; }

  const sEl = document.getElementById("pSigStatus");
  showStatus(sEl, "⏳ Saving...", "var(--text2)");
  try {
    const exp = document.createElement("canvas");
    exp.width = canvas.width; exp.height = canvas.height;
    const ec = exp.getContext("2d");
    ec.fillStyle = "#ffffff"; ec.fillRect(0, 0, exp.width, exp.height); ec.drawImage(canvas, 0, 0);
    const blob = await new Promise(res => exp.toBlob(res, "image/png"));
    const task = uploadBytesResumable(ref(storage, `signatures/principal_${user.uid}`), blob, { contentType: "image/png" });
    task.on("state_changed",
      s => showStatus(sEl, `⏳ ${Math.round(s.bytesTransferred / s.totalBytes * 100)}%`, "var(--text2)"),
      err => showStatus(sEl, "❌ " + err.message, "#ef4444"),
      async () => {
        const url  = await getDownloadURL(task.snapshot.ref);
        const slug = adminData.schoolSlug;
        await setDoc(doc(db, "schoolSettings", slug), { principalSignature: url }, { merge: true });
        if (schoolData) schoolData.principalSignature = url;
        const wrap = document.getElementById("pSigSavedWrap");
        const img  = document.getElementById("pSigPreview");
        const rb   = document.getElementById("pRemoveSigBtn");
        if (wrap) wrap.style.display = "block";
        if (img)  img.src = url;
        if (rb)   rb.style.display = "inline-block";
        showStatus(sEl, "✅ Signature saved!", "#4ade80");
        toast("Principal signature saved!", "success");
      }
    );
  } catch (err) { toast("Save failed: " + err.message, "error"); }
});

document.getElementById("pRemoveSigBtn")?.addEventListener("click", async () => {
  if (!confirm("Remove principal signature?")) return;
  const slug = adminData.schoolSlug;
  await setDoc(doc(db, "schoolSettings", slug), { principalSignature: "" }, { merge: true });
  if (schoolData) schoolData.principalSignature = "";
  const wrap = document.getElementById("pSigSavedWrap");
  const rb   = document.getElementById("pRemoveSigBtn");
  if (wrap) wrap.style.display = "none";
  if (rb)   rb.style.display   = "none";
  const canvas = document.getElementById("pSigCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    canvas._padInit = false; initPrincipalSignaturePad();
  }
  toast("Signature removed.", "info");
});

/* ════════════════════════════════
   SAVE SETTINGS
════════════════════════════════ */
document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
  const school = (document.getElementById("settingsSchoolName")?.value  || "").trim();
  const name   = (document.getElementById("settingsPrincipalName")?.value || "").trim();
  const title  =  document.getElementById("settingsPrincipalTitle")?.value || "Principal";
  if (!school || !name) { toast("School name and principal name are required.", "warning"); return; }

  const btn = document.getElementById("saveSettingsBtn");
  btn.textContent = "Saving..."; btn.disabled = true;
  try {
    const uid  = auth.currentUser.uid;
    const slug = adminData.schoolSlug;
    await setDoc(doc(db,"users",uid), { school, name, principalTitle: title }, { merge: true });
    await setDoc(doc(db,"schoolSettings",slug), { school, principalName: name, principalTitle: title }, { merge: true });
    adminData.school = school; adminData.name = name; adminData.principalTitle = title;
    fillUI();
    toast("Settings saved!", "success");
  } catch (err) { toast("Failed: " + err.message, "error"); }
  finally { btn.textContent = "💾 Save Changes"; btn.disabled = false; }
});

/* ════════════════════════════════
   REGENERATE ADMIN CODE
════════════════════════════════ */
document.getElementById("regenCodeBtn")?.addEventListener("click", async () => {
  if (!confirm("Regenerate your school's admin code? The old code will stop working.")) return;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  try {
    const slug = adminData.schoolSlug;
    await setDoc(doc(db, "schoolSettings", slug), { adminCode: code }, { merge: true });
    if (schoolData) schoolData.adminCode = code;
    const settingsCode = document.getElementById("settingsAdminCode");
    if (settingsCode) settingsCode.textContent = code;
    toast("New code generated: " + code, "success", 6000);
  } catch (err) { toast("Failed: " + err.message, "error"); }
});