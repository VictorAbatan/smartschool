import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, addDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk8lgaU1c7n2-Mt3TetoUE2JGJDA7U6F8",
  authDomain: "smartschool-system.firebaseapp.com",
  projectId: "smartschool-system",
  storageBucket: "smartschool-system.firebasestorage.app",
  messagingSenderId: "122165307933",
  appId: "1:122165307933:web:a604d91489aa62924434f4"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const errorEl   = document.getElementById("signupError");
const successEl = document.getElementById("successAlert");
const loadingEl = document.getElementById("loadingMsg");

let selectedRole   = "";
let verifiedSchool = null; // { school, slug } — set only after code passes

/* ── LOAD SCHOOLS ── */
async function loadSchools() {
  const sel = document.getElementById("schoolSelect");
  try {
    const snap = await getDocs(collection(db, "schoolSettings"));
    sel.innerHTML = `<option value="">— Select your school —</option>`;
    snap.forEach(d => {
      const data = d.data();
      const opt  = document.createElement("option");
      opt.value        = d.id;
      opt.textContent  = data.school;
      opt.dataset.code = data.adminCode;
      sel.appendChild(opt);
    });
    if (snap.empty) sel.innerHTML = `<option value="">No schools registered yet</option>`;
  } catch (err) {
    sel.innerHTML = `<option value="">Error loading schools</option>`;
  }
}
loadSchools();

/* ── VALIDATE CODE ── */
function validateCode() {
  const sel      = document.getElementById("schoolSelect");
  const codeEl   = document.getElementById("adminCode");
  const statusEl = document.getElementById("schoolCodeStatus");
  const code     = codeEl.value.trim().toUpperCase();
  const option   = sel.options[sel.selectedIndex];

  statusEl.style.display = "none";
  verifiedSchool = null;
  if (!sel.value || !code) return;

  statusEl.style.display = "block";
  if (code === option.dataset.code) {
    statusEl.style.color = "#4ade80";
    statusEl.textContent = "✅ Code verified!";
    verifiedSchool = { school: option.textContent, slug: sel.value };
  } else {
    statusEl.style.color = "#ef4444";
    statusEl.textContent = "❌ Incorrect code. Check with your principal.";
  }
}
document.getElementById("adminCode").addEventListener("input", validateCode);
document.getElementById("schoolSelect").addEventListener("change", () => {
  document.getElementById("adminCode").value = "";
  validateCode();
});

/* ── STEP NAVIGATION ── */
function showStep(n) {
  document.querySelectorAll(".form-step").forEach((s, i) => s.classList.toggle("active", i + 1 === n));
  document.querySelectorAll(".step").forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 === n) dot.classList.add("active");
    if (i + 1 < n)  dot.classList.add("done");
  });
  errorEl.textContent = "";
}

/* ── ROLE SELECTION ── */
document.querySelectorAll(".role-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".role-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedRole = card.dataset.role;
    document.getElementById("teacherRole").value = selectedRole;
    document.getElementById("subjectsSection").style.display        = "block";
    document.getElementById("classesTeachingSection").style.display = "block";
    document.getElementById("mainClassSection").style.display = selectedRole === "both" ? "block" : "none";
  });
});

/* ── ADD CLASS ROW ── */
document.getElementById("addClassRowBtn").addEventListener("click", () => {
  const row = document.createElement("div");
  row.className = "class-builder-row";
  row.innerHTML = `
    <select class="styled-select class-level-pick">
      <option value="">Level</option>
      <optgroup label="Junior Secondary">
        <option>JSS1</option><option>JSS2</option><option>JSS3</option>
      </optgroup>
      <optgroup label="Senior Secondary">
        <option>SS1</option><option>SS2</option><option>SS3</option>
      </optgroup>
    </select>
    <div class="arms-checkboxes">
      <label><input type="checkbox" value="A"> A</label>
      <label><input type="checkbox" value="B"> B</label>
      <label><input type="checkbox" value="C"> C</label>
      <label><input type="checkbox" value="D"> D</label>
      <label><input type="checkbox" value="E"> E</label>
      <label><input type="checkbox" value="F"> F</label>
    </div>
    <button class="remove-row-btn" onclick="this.closest('.class-builder-row').remove()">✕</button>`;
  document.getElementById("classesBuilder").appendChild(row);
});

/* ── PASSWORD TOGGLES ── */
[["toggle1","password"],["toggle2","confirmPassword"]].forEach(([tid, iid]) => {
  document.getElementById(tid)?.addEventListener("click", () => {
    const inp = document.getElementById(iid);
    inp.type = inp.type === "password" ? "text" : "password";
  });
});

/* ── HELPERS ── */
function getSubjectsTaught() {
  return Array.from(document.querySelectorAll("#subjectsGrid input:checked")).map(cb => cb.value);
}
function getClassesTeaching() {
  const result = [];
  document.querySelectorAll(".class-builder-row").forEach(row => {
    const level = row.querySelector(".class-level-pick").value;
    if (!level) return;
    row.querySelectorAll(".arms-checkboxes input:checked").forEach(cb => result.push(level + cb.value));
  });
  return result;
}
function getMainClass() {
  const level = document.getElementById("mainClassLevel").value;
  const arm   = document.getElementById("mainClassArm").value;
  return (level && arm) ? level + arm : "";
}

/* ── STEP 1 → 2 ── */
document.getElementById("toStep2Btn").addEventListener("click", () => {
  if (!document.getElementById("name").value.trim())  { errorEl.textContent = "Please enter your full name."; return; }
  if (!document.getElementById("email").value.trim()) { errorEl.textContent = "Please enter your email."; return; }
  if (!document.getElementById("schoolSelect").value) { errorEl.textContent = "Please select your school."; return; }
  if (!verifiedSchool) { errorEl.textContent = "Please enter a valid admin code to proceed."; return; }
  if (!selectedRole)   { errorEl.textContent = "Please select your teacher role."; return; }
  showStep(2);
});

/* ── STEP 2 → 3 ── */
document.getElementById("toStep3Btn").addEventListener("click", () => {
  if (getSubjectsTaught().length === 0)  { errorEl.textContent = "Please select at least one subject."; return; }
  if (getClassesTeaching().length === 0) { errorEl.textContent = "Please add at least one class with an arm selected."; return; }
  if (selectedRole === "both" && !getMainClass()) { errorEl.textContent = "Please select your main class and arm."; return; }
  buildSummary();
  showStep(3);
});

/* ── SUMMARY ── */
function buildSummary() {
  const subjects  = getSubjectsTaught();
  const classes   = getClassesTeaching();
  const mainClass = getMainClass();
  let html = `
    <div class="summary-row"><span>Name</span><span>${document.getElementById("name").value.trim()}</span></div>
    <div class="summary-row"><span>Email</span><span>${document.getElementById("email").value.trim()}</span></div>
    <div class="summary-row"><span>School</span><span>${verifiedSchool.school}</span></div>
    <div class="summary-row"><span>Role</span><span>${selectedRole === "subject" ? "Subject Teacher" : "Class Teacher"}</span></div>`;
  if (mainClass) html += `<div class="summary-row"><span>Main Class</span><span>${mainClass}</span></div>`;
  html += `<div class="summary-row"><span>Subjects</span><div class="summary-tags">${subjects.map(s=>`<span class="summary-tag">${s}</span>`).join("")}</div></div>`;
  html += `<div class="summary-row"><span>Classes</span><div class="summary-tags">${classes.map(c=>`<span class="summary-tag">${c}</span>`).join("")}</div></div>`;
  document.getElementById("summaryContent").innerHTML = html;
}

/* ── BACK BUTTONS ── */
document.getElementById("backToStep1Btn").addEventListener("click", () => showStep(1));
document.getElementById("backToStep2Btn").addEventListener("click", () => showStep(2));

/* ── SIGNUP ── */
document.getElementById("signupBtn").addEventListener("click", async () => {
  errorEl.textContent = "";
  const password = document.getElementById("password").value;
  const confirm  = document.getElementById("confirmPassword").value;
  if (!password || password.length < 6) { errorEl.textContent = "Password must be at least 6 characters."; return; }
  if (password !== confirm)              { errorEl.textContent = "Passwords do not match."; return; }
  if (!verifiedSchool) { errorEl.textContent = "School code verification failed. Go back and re-enter."; return; }

  loadingEl.style.display = "block";
  document.getElementById("signupBtn").disabled = true;

  try {
    const userCred = await createUserWithEmailAndPassword(auth,
      document.getElementById("email").value.trim(), password);
    const uid = userCred.user.uid;

    const userData = {
      name:            document.getElementById("name").value.trim(),
      email:           document.getElementById("email").value.trim(),
      school:          verifiedSchool.school,
      schoolSlug:      verifiedSchool.slug,
      role:            "teacher",
      teacherType:     selectedRole,
      subjectsTaught:  getSubjectsTaught(),
      classesTeaching: getClassesTeaching(),
      createdAt:       new Date().toISOString()
    };
    if (selectedRole === "both") userData.mainClass = getMainClass();

    await setDoc(doc(db, "users", uid), userData);

    // Notify admin of new teacher registration
    try {
      await addDoc(collection(db, "adminNotifications"), {
        school:    verifiedSchool.school,
        icon:      "\u{1F468}\u200D\u{1F3EB}",
        message:   `New teacher registered: ${userData.name} (${userData.teacherType === "both" ? "Class Teacher" : "Subject Teacher"})`,
        type:      "new_teacher",
        read:      false,
        createdAt: serverTimestamp()
      });
    } catch {}
    loadingEl.style.display = "none";
    successEl.style.display = "block";
    setTimeout(() => { window.location.href = "teacher-login.html"; }, 2000);

  } catch (err) {
    loadingEl.style.display = "none";
    document.getElementById("signupBtn").disabled = false;
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") msg = "This email is already registered.";
    if (err.code === "auth/invalid-email")         msg = "Invalid email address.";
    if (err.code === "auth/weak-password")         msg = "Password too weak.";
    errorEl.textContent = msg;
  }
});