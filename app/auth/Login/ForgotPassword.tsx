import { useState } from "react";
import { Link } from "react-router";
import { resetPassword } from "../../firebase/AuthService";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    
    try {
      await resetPassword(email);
      setMessage("Password recovery email sent! Check your inbox.");
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (code: string | undefined) => {
    if (!code) return "An unknown error occurred. Please try again.";
    switch (code) {
      case "auth/user-not-found":
        return "No user found with this email.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      default:
        return `An error occurred (${code}). Please try again.`;
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
          <h1 style={styles.title}>Reset Password</h1>
          <p style={styles.subtitle}>Enter your email to receive a password recovery link.</p>

          {error && <div style={styles.errorBox}>{error}</div>}
          {message && <div style={styles.successBox}>{message}</div>}

          <form onSubmit={handleResetPassword} style={styles.form}>
            {/* Email */}
            <div style={styles.inputWrapper}>
              <span style={styles.inputIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </span>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? "Sending..." : "Send Recovery Email"}
            </button>
          </form>

          <div style={styles.signupPrompt}>
            Remember your password?{" "}
            <Link to="/login" style={styles.signupLink}>
              Log in
            </Link>
          </div>
        </div>

        <div style={styles.footer}>
          <Link to="#" style={styles.footerLink}>Terms of Service</Link>
          <span style={styles.footerSep}>•</span>
          <Link to="#" style={styles.footerLink}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
  },
  leftPanel: {
    flex: 1,
    background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    color: "white",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "40px",
    position: "relative",
    overflow: "hidden",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoIcon: {
    background: "rgba(255,255,255,0.2)",
    padding: "8px",
    borderRadius: "10px",
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
    fontSize: "20px",
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
    padding: "40px 60px 24px",
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
    marginBottom: "6px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "24px",
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
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#16a34a",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  inputIcon: {
    position: "absolute",
    left: "12px",
    display: "flex",
    alignItems: "center",
  },
  input: {
    width: "100%",
    padding: "11px 40px 11px 38px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    color: "#111",
    transition: "border-color 0.2s",
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
    transition: "background 0.2s",
    opacity: 1,
  },
  signupPrompt: {
    marginTop: "24px",
    textAlign: "center",
    fontSize: "13px",
    color: "#6b7280",
    padding: "12px",
    background: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  signupLink: {
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
