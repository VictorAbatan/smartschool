import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const errorEl = document.getElementById("signupError");

/* ── STEP NAVIGATION ── */
function showStep(n) {
  document.querySelectorAll(".form-step").forEach((s, i) => s.classList.toggle("active", i+1 === n));
  document.querySelectorAll(".step").forEach((dot, i) => {
    dot.classList.remove("active","done");
    if (i+1 === n) dot.classList.add("active");
    if (i+1 < n)  dot.classList.add("done");
  });
  errorEl.textContent = "";
}

/* ── PASSWORD TOGGLES ── */
[["toggle1", "password"], ["toggle2", "confirmPassword"]].forEach(([toggleId, inputId]) => {
  document.getElementById(toggleId)?.addEventListener("click", () => {
    const inp = document.getElementById(inputId);
    inp.type = inp.type === "password" ? "text" : "password";
  });
});

/* ── GENERATE UNIQUE 6-CHAR CODE ── */
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getUniqueCode() {
  let code, exists = true;
  while (exists) {
    code = generateCode();
    const q = query(collection(db,"schoolSettings"), where("adminCode","==",code));
    const snap = await getDocs(q);
    exists = !snap.empty;
  }
  return code;
}

function schoolSlug(name) {
  return name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
}

/* ── STEP 1 → 2 ── */
document.getElementById("toStep2Btn")?.addEventListener("click", () => {
  const name   = document.getElementById("name").value.trim();
  const email  = document.getElementById("email").value.trim();
  const school = document.getElementById("schoolName").value.trim();
  if (!name)   { errorEl.textContent = "Please enter your full name."; return; }
  if (!email)  { errorEl.textContent = "Please enter your email."; return; }
  if (!school) { errorEl.textContent = "Please enter your school name."; return; }
  showStep(2);
});

document.getElementById("backToStep1Btn")?.addEventListener("click", () => showStep(1));

/* ── SIGNUP ── */
document.getElementById("signupBtn")?.addEventListener("click", async () => {
  errorEl.textContent = "";
  const password = document.getElementById("password").value;
  const confirm  = document.getElementById("confirmPassword").value;
  if (!password || password.length < 6) { errorEl.textContent = "Password must be at least 6 characters."; return; }
  if (password !== confirm)              { errorEl.textContent = "Passwords do not match."; return; }

  const btn = document.getElementById("signupBtn");
  btn.textContent = "Creating..."; btn.disabled = true;

  try {
    const name   = document.getElementById("name").value.trim();
    const email  = document.getElementById("email").value.trim();
    const school = document.getElementById("schoolName").value.trim();
    const title  = document.getElementById("principalTitle").value;
    const slug   = schoolSlug(school);
    const adminCode = await getUniqueCode();

    // Create Firebase Auth account
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;

    // Save admin user doc
    await setDoc(doc(db,"users",uid), {
      name, email, school, role: "admin",
      principalTitle: title,
      schoolSlug: slug,
      createdAt: new Date().toISOString()
    });

    // Save school settings doc — this is the single source of truth for the school
    await setDoc(doc(db,"schoolSettings",slug), {
      school, slug, adminCode,
      principalName: name,
      principalTitle: title,
      principalUid: uid,
      principalSignature: "",
      createdAt: new Date().toISOString()
    });

    // Show code to principal
    document.getElementById("generatedCode").textContent = adminCode;
    showStep(3);

  } catch (err) {
    btn.textContent = "Create Admin Account"; btn.disabled = false;
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") msg = "This email is already registered.";
    if (err.code === "auth/invalid-email")         msg = "Invalid email address.";
    if (err.code === "auth/weak-password")         msg = "Password too weak.";
    errorEl.textContent = msg;
  }
});

/* ── COPY CODE ── */
document.getElementById("copyCodeBtn")?.addEventListener("click", () => {
  const code = document.getElementById("generatedCode").textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById("copyCodeBtn");
    btn.textContent = "✅ Copied!";
    setTimeout(() => btn.textContent = "📋 Copy Code", 2000);
  });
});