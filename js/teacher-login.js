import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn      = document.getElementById("loginBtn");
const loginBtnText  = document.getElementById("loginBtnText");
const loginSpinner  = document.getElementById("loginSpinner");
const errorEl       = document.getElementById("loginError");
const togglePw      = document.getElementById("togglePassword");

togglePw.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  togglePw.textContent = isHidden ? "👁‍🗨" : "👁";
});

document.getElementById("adminToggleBtn").addEventListener("click", () => {
  const section = document.getElementById("adminSection");
  const btn     = document.getElementById("adminToggleBtn");
  const isOpen  = section.style.display !== "none";
  section.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "Admin access ▾" : "Admin access ▴";
});

document.getElementById("adminLoginBtn").addEventListener("click", async () => {
  const adminCode  = (document.getElementById("adminCode")?.value  || "").trim().toUpperCase();
  const adminEmail = (document.getElementById("adminEmail")?.value || "").trim();
  const adminPass  =  document.getElementById("adminPassword")?.value || "";
  errorEl.textContent = "";

  if (!adminCode)  { errorEl.textContent = "Please enter your school's admin code."; return; }
  if (!adminEmail) { errorEl.textContent = "Please enter your email."; return; }
  if (!adminPass)  { errorEl.textContent = "Please enter your password."; return; }

  const adminBtn = document.getElementById("adminLoginBtn");
  adminBtn.textContent = "Verifying..."; adminBtn.disabled = true;

  try {
    const q    = query(collection(db,"schoolSettings"), where("adminCode","==",adminCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      errorEl.textContent = "Invalid admin code. Check with your school administrator.";
      adminBtn.textContent = "Enter as Admin"; adminBtn.disabled = false;
      return;
    }

    const userCred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    const userSnap = await getDoc(doc(db,"users",userCred.user.uid));

    if (!userSnap.exists() || userSnap.data().role !== "admin") {
      errorEl.textContent = "This account does not have admin access.";
      adminBtn.textContent = "Enter as Admin"; adminBtn.disabled = false;
      return;
    }

    const schoolData = snap.docs[0].data();
    if (schoolData.principalUid !== userCred.user.uid) {
      errorEl.textContent = "This admin code does not belong to your account.";
      adminBtn.textContent = "Enter as Admin"; adminBtn.disabled = false;
      return;
    }

    window.location.href = "admin-dashboard.html";

  } catch (err) {
    adminBtn.textContent = "Enter as Admin"; adminBtn.disabled = false;
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      errorEl.textContent = "No account found with this email.";
    } else if (err.code === "auth/wrong-password") {
      errorEl.textContent = "Incorrect password.";
    } else if (err.code === "auth/too-many-requests") {
      errorEl.textContent = "Too many attempts. Please wait.";
    } else {
      errorEl.textContent = err.message;
    }
  }
});

function setLoading(loading) {
  loginBtn.disabled          = loading;
  loginBtnText.style.display = loading ? "none"   : "inline";
  loginSpinner.style.display = loading ? "inline" : "none";
}

loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email)    { errorEl.textContent = "Please enter your email address."; return; }
  if (!password) { errorEl.textContent = "Please enter your password."; return; }
  setLoading(true);
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const snap     = await getDoc(doc(db,"users",userCred.user.uid));
    if (!snap.exists()) { errorEl.textContent = "Account not found. Please sign up first."; setLoading(false); return; }
    const data = snap.data();
    if (data.role === "teacher")    window.location.href = "teacher-dashboard.html";
    else if (data.role === "admin") window.location.href = "admin-dashboard.html";
    else { errorEl.textContent = "Unauthorized account type."; setLoading(false); }
  } catch (err) {
    setLoading(false);
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      errorEl.textContent = "No account found with this email.";
    } else if (err.code === "auth/wrong-password") {
      errorEl.textContent = "Incorrect password. Please try again.";
    } else if (err.code === "auth/too-many-requests") {
      errorEl.textContent = "Too many attempts. Please wait a moment and try again.";
    } else if (err.code === "auth/invalid-email") {
      errorEl.textContent = "Invalid email address.";
    } else {
      errorEl.textContent = err.message;
    }
  }
});

[emailInput, passwordInput].forEach(input => {
  input.addEventListener("keydown", e => { if (e.key === "Enter") loginBtn.click(); });
});