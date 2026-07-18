import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { signUpTeacherWithEmail, signInWithGoogle, signInWithFacebook } from "../../firebase/AuthService";

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const validate = () => {
    if (form.password !== form.confirmPassword)
      return "Passwords do not match.";
    if (form.password.length < 6)
      return "Password must be at least 6 characters.";
    if (!agreedToTerms)
      return "Please agree to the Terms of Service and Privacy Policy.";
    return null;
  };

   const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) return setError(validationError);

    setError("");
    setLoading(true);

    try {
      // Call the external service
      await signUpTeacherWithEmail(form);
      
      // Navigate on success
      navigate("/dashboard");
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");
    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    }
  };

  const handleFacebookSignUp = async () => {
    setError("");
    try {
      await signInWithFacebook();
      navigate("/dashboard");
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    }
  };

  const getErrorMessage = (code: string) => {
    switch (code) {
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/weak-password":
        return "Password should be at least 6 characters.";
      default:
        return "An error occurred. Please try again.";
    }
  };

  return (
    <div style={styles.container}>
      {/* Left Panel */}
      <div style={styles.leftPanel}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={styles.logoText}>Enginuity</span>
        </div>
        <div style={styles.quote}>
          <p style={styles.quoteText}>
            "Education is the passport to the future, for tomorrow belongs to
            those who prepare for it today."
          </p>
          <p style={styles.quoteAuthor}>— Malcolm X</p>
        </div>
      </div>

      {/* Right Panel */}
      <div style={styles.rightPanel}>
        <div style={styles.formContainer}>
          <h1 style={styles.title}>Sign Up</h1>

          {error && <div style={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSignUp} style={styles.form}>
            {/* Name Row */}
            <div style={styles.nameRow}>
              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}><PersonIcon /></span>
                <input
                  name="firstName"
                  type="text"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}><PersonIcon /></span>
                <input
                  name="lastName"
                  type="text"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                  style={styles.input}
                />
              </div>
            </div>

            {/* Email */}
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}><EmailIcon /></span>
              <input
                name="email"
                type="email"
                placeholder="Enter your email"
                value={form.email}
                onChange={handleChange}
                required
                style={styles.input}
              />
            </div>

            {/* Phone */}
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}><PersonIcon /></span>
              <input
                name="phone"
                type="tel"
                placeholder="Enter your phone number"
                value={form.phone}
                onChange={handleChange}
                style={styles.input}
              />
            </div>

            {/* Password */}
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}><LockIcon /></span>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange}
                required
                style={styles.input}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <EyeIcon open={showPassword} />
              </button>
            </div>

            {/* Confirm Password */}
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}><LockIcon /></span>
              <input
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm your password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                style={styles.input}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={styles.eyeButton}>
                <EyeIcon open={showConfirm} />
              </button>
            </div>

            {/* Terms */}
            <label style={styles.termsLabel}>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.termsText}>
                I agree to the{" "}
                <a href="#" style={styles.termsLink}>Terms of Service</a>
                {" "}and{" "}
                <a href="#" style={styles.termsLink}>Privacy Policy</a>
              </span>
            </label>

            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? "Creating account..." : "Sign Up →"}
            </button>
          </form>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>OR SIGN UP WITH</span>
            <div style={styles.dividerLine} />
          </div>

          <div style={styles.socialRow}>
            <button onClick={handleGoogleSignUp} style={styles.socialBtn}>
              <GoogleIcon /> Google
            </button>
            <button onClick={handleFacebookSignUp} style={styles.socialBtn}>
              <FacebookIcon /> Facebook
            </button>
          </div>
          <div style={styles.loginPrompt}>
            Already have an account?{" "}
            <Link to="/" style={styles.loginLink}>Login as a teacher</Link>
          </div>
        </div>

        <div style={styles.footer}>
          <a href="#" style={styles.footerLink}>Privacy Policy</a>
          <span style={styles.footerSep}>|</span>
          <a href="#" style={styles.footerLink}>Terms of Service</a>
          <span style={styles.footerSep}>|</span>
          <a href="#" style={styles.footerLink}>Support</a>
        </div>
      </div>
    </div>
  );
}

// Icon components
const PersonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const EmailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "100vh",
    fontFamily: "'Segoe UI', sans-serif",
    overflow: "hidden",
  },
  leftPanel: {
    width: "45%",
    background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800') center/cover no-repeat",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "32px",
    color: "white",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoIcon: {
    width: "36px",
    height: "36px",
    background: "#22c55e",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: "20px",
    fontWeight: "600",
  },
  quote: {
    padding: "0 16px 40px",
  },
  quoteText: {
    fontSize: "18px",
    fontWeight: "500",
    lineHeight: "1.5",
    marginBottom: "12px",
  },
  quoteAuthor: {
    fontSize: "14px",
    opacity: 0.85,
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "32px 60px 24px",
    overflowY: "auto",
    backgroundColor: "#fff",
  },
  formContainer: {
    maxWidth: "380px",
    width: "100%",
    margin: "auto",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#111",
    marginBottom: "20px",
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  nameRow: {
    display: "flex",
    gap: "10px",
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flex: 1,
  },
  inputIcon: {
    position: "absolute",
    left: "12px",
    display: "flex",
    alignItems: "center",
    zIndex: 1,
  },
  input: {
    width: "100%",
    padding: "11px 36px 11px 38px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    color: "#111",
  },
  eyeButton: {
    position: "absolute",
    right: "12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: 0,
  },
  termsLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    cursor: "pointer",
  },
  checkbox: {
    width: "15px",
    height: "15px",
    accentColor: "#22c55e",
    marginTop: "2px",
    flexShrink: 0,
  },
  termsText: {
    fontSize: "13px",
    color: "#374151",
    lineHeight: "1.4",
  },
  termsLink: {
    color: "#22c55e",
    textDecoration: "none",
    fontWeight: "500",
  },
  submitBtn: {
    width: "100%",
    padding: "12px",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "4px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    margin: "16px 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "#e5e7eb",
  },
  dividerText: {
    fontSize: "11px",
    color: "#9ca3af",
    fontWeight: "500",
    whiteSpace: "nowrap",
  },
  socialRow: {
    display: "flex",
    gap: "12px",
  },
  socialBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "10px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "white",
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
    cursor: "pointer",
  },
  loginPrompt: {
    marginTop: "16px",
    textAlign: "center",
    fontSize: "13px",
    color: "#6b7280",
    padding: "12px",
    background: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  loginLink: {
    color: "#22c55e",
    fontWeight: "600",
    textDecoration: "none",
  },
  footer: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    fontSize: "12px",
  },
  footerLink: {
    color: "#9ca3af",
    textDecoration: "none",
  },
  footerSep: {
    color: "#d1d5db",
  },
};