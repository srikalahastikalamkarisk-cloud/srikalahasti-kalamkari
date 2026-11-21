"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, LockKeyhole, Eye, EyeOff, ShieldCheck } from "lucide-react";
import "./admin-login.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(
          response.status === 401
            ? "Invalid email or password."
            : "Unable to sign in. Please try again."
        );
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sk-admin-login">
      <div className="sk-login-shell">
        
<section className="sk-login-brand">
  <div className="sk-login-logo-frame">
    <img
      src="/srikalahasti-logo.png"
      alt="Srikalahasti Kalamkari"
      className="sk-login-original-logo"
    />
  </div>
  <div className="sk-login-brand-name">
    <strong>SRIKALAHASTI</strong>
    <span>K A L A M K A R I</span>
  </div>
  <div className="sk-login-gold-divider" aria-hidden="true">✦</div>
</section>

<section className="sk-login-form-section">
          <div className="sk-login-form-wrap">
            <p className="sk-login-label"><ShieldCheck size={15} /> SECURE ADMIN PORTAL</p>
            <h2>Welcome back.</h2>
            <p className="sk-login-subtitle">
              Your atelier, collections and store management — all in one place.
            </p>

            <form onSubmit={handleSubmit} className="sk-login-form">
              <label htmlFor="sk-admin-email">Email address</label>
              <div className="sk-email-field">
                <Mail size={18} aria-hidden="true" />
                <input
                id="sk-admin-email"
                type="email"
                autoComplete="username"
                placeholder="Enter your email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              </div>

              <label htmlFor="sk-admin-password">Password</label>
              <div className="sk-password-field">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  id="sk-admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="sk-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="sk-login-forgot"><Link href="/admin/forgot-password">Forgot Password?</Link></div>

              {error && (
                <p className="sk-login-error" role="alert">{error}</p>
              )}

              <button
                type="submit"
                className="sk-login-submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
                <span aria-hidden="true">→</span>
              </button>
            </form>

            <Link className="sk-login-back" href="/">
              ← Back to Website
            </Link>
          </div>

          <p className="sk-login-copyright">
            © {new Date().getFullYear()} Srikalahasti Kalamkari.
            All rights reserved.
          </p>
        </section>
      </div>
    </main>
  );
}
