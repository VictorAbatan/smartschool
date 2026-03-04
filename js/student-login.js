import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const emailInput   = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn     = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");
const loginSpinner = document.getElementById("loginSpinner");
const errorEl      = document.getElementById("loginError");

/* ── PASSWORD TOGGLE ── */
document.getElementById("togglePassword").addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  document.getElementById("togglePassword").textContent = isHidden ? "👁‍🗨" : "👁";
});

/* ── LOGIN ── */
function setLoading(on) {
  loginBtn.disabled          = on;
  loginBtnText.style.display = on ? "none"   : "inline";
  loginSpinner.style.display = on ? "inline" : "none";
}

loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  const email    = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email)    { errorEl.textContent = "Please enter your email."; return; }
  if (!password) { errorEl.textContent = "Please enter your password."; return; }

  setLoading(true);
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const snap     = await getDoc(doc(db, "users", userCred.user.uid));

    if (!snap.exists()) {
      errorEl.textContent = "Account not found. Please sign up first.";
      setLoading(false); return;
    }

    const data = snap.data();
    if (data.role === "student") {
      window.location.href = "student-dashboard.html";
    } else {
      errorEl.textContent = "This is not a student account.";
      setLoading(false);
    }
  } catch (err) {
    setLoading(false);
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential")
      errorEl.textContent = "No account found with this email.";
    else if (err.code === "auth/wrong-password")
      errorEl.textContent = "Incorrect password.";
    else if (err.code === "auth/too-many-requests")
      errorEl.textContent = "Too many attempts. Please wait and try again.";
    else
      errorEl.textContent = err.message;
  }
});

/* ── ENTER KEY ── */
[emailInput, passwordInput].forEach(inp => {
  inp.addEventListener("keydown", e => { if (e.key === "Enter") loginBtn.click(); });
});