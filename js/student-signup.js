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

/* ── LOAD SCHOOLS ── */
async function loadSchools() {
  const sel = document.getElementById("schoolSelect");
  try {
    const snap = await getDocs(collection(db, "schoolSettings"));
    sel.innerHTML = `<option value="">— Select your school —</option>`;
    snap.forEach(d => {
      const data = d.data();
      const opt  = document.createElement("option");
      opt.value       = data.school;
      opt.textContent = data.school;
      sel.appendChild(opt);
    });
    if (snap.empty) sel.innerHTML = `<option value="">No schools registered yet</option>`;
  } catch (err) {
    sel.innerHTML = `<option value="">Error loading schools</option>`;
  }
}
loadSchools();

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

/* ── PASSWORD TOGGLES ── */
[["toggle1", "password"], ["toggle2", "confirmPassword"]].forEach(([tid, iid]) => {
  document.getElementById(tid)?.addEventListener("click", () => {
    const inp = document.getElementById(iid);
    inp.type = inp.type === "password" ? "text" : "password";
  });
});

/* ── STEP 1 → 2 ── */
document.getElementById("toStep2Btn").addEventListener("click", () => {
  const name    = document.getElementById("name").value.trim();
  const email   = document.getElementById("email").value.trim();
  const school  = document.getElementById("schoolSelect").value;
  const level   = document.getElementById("classLevel").value;
  const arm     = document.getElementById("classArm").value;

  if (!name)   { errorEl.textContent = "Please enter your full name."; return; }
  if (!email)  { errorEl.textContent = "Please enter your email address."; return; }
  if (!school) { errorEl.textContent = "Please select your school."; return; }
  if (!level)  { errorEl.textContent = "Please select your class level."; return; }
  if (!arm)    { errorEl.textContent = "Please select your class arm."; return; }

  // Build summary
  document.getElementById("summaryContent").innerHTML = `
    <div class="summary-row"><span>Name</span><span>${name}</span></div>
    <div class="summary-row"><span>Email</span><span>${email}</span></div>
    <div class="summary-row"><span>School</span><span>${school}</span></div>
    <div class="summary-row"><span>Class</span><span>${level}${arm}</span></div>
  `;

  showStep(2);
});

/* ── BACK ── */
document.getElementById("backBtn").addEventListener("click", () => showStep(1));

/* ── SIGNUP ── */
document.getElementById("signupBtn").addEventListener("click", async () => {
  errorEl.textContent = "";

  const password = document.getElementById("password").value;
  const confirm  = document.getElementById("confirmPassword").value;

  if (!password || password.length < 6) { errorEl.textContent = "Password must be at least 6 characters."; return; }
  if (password !== confirm)              { errorEl.textContent = "Passwords do not match."; return; }

  const name         = document.getElementById("name").value.trim();
  const email        = document.getElementById("email").value.trim();
  const school       = document.getElementById("schoolSelect").value;
  const level        = document.getElementById("classLevel").value;
  const arm          = document.getElementById("classArm").value;
  const studentClass = level + arm;

  loadingEl.style.display = "block";
  document.getElementById("signupBtn").disabled = true;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;

    await setDoc(doc(db, "users", uid), {
      name,
      email,
      school,
      studentClass,
      role:      "student",
      createdAt: new Date().toISOString()
    });

    // Notify admin of new student registration
    try {
      await addDoc(collection(db, "adminNotifications"), {
        school:    school,
        icon:      "\u{1F393}",
        message:   `New student registered: ${name} (${studentClass})`,
        type:      "new_student",
        read:      false,
        createdAt: serverTimestamp()
      });
    } catch {}

    loadingEl.style.display = "none";
    successEl.style.display = "block";
    setTimeout(() => { window.location.href = "student-login.html"; }, 2000);

  } catch (err) {
    loadingEl.style.display = "none";
    document.getElementById("signupBtn").disabled = false;
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") msg = "This email is already registered. Try logging in.";
    if (err.code === "auth/invalid-email")         msg = "Invalid email address.";
    if (err.code === "auth/weak-password")         msg = "Password is too weak.";
    errorEl.textContent = msg;
  }
});