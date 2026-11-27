"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye, EyeOff, ArrowRight, ShieldCheck,
  Mail, LockKeyhole
} from "lucide-react";
import "./customer-auth.css";

type Mode = "login" | "register" | "forgot";

export default function CustomerAuth({ mode }: { mode: Mode }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedReturn = searchParams.get("returnTo");

  const checkoutReturn =
    requestedReturn === "/checkout?buyNow=1" ||
    requestedReturn === "/checkout"
      ? requestedReturn
      : null;

  function authHref(path: string) {
    return checkoutReturn
      ? `${path}?returnTo=${encodeURIComponent(checkoutReturn)}`
      : path;
  }


  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const data = new FormData(e.currentTarget);
    const payload = Object.fromEntries(data.entries());
    try {
      const endpoint = isRegister ? "/api/customer/register" : isForgot ? "/api/customer/forgot-password" : "/api/customer/login";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, termsAccepted: data.get("termsAccepted") === "on", returnTo: searchParams.get("returnTo") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to complete this request.");
      if (isRegister) setMessage("Your account has been created. Check your inbox for a verification link. Verify your email before signing in and checking out.");
      else if (isForgot) setMessage(result.message);
          else if (result.verificationRequired) setMessage("Please verify your email first. You can request a new link below.");
      else {
        const destination = typeof result.returnTo === "string" ? result.returnTo : "/account";
        router.replace(destination);
        router.refresh();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to complete this request."); }
    finally { setBusy(false); }
  }

  return (
    <main className={`skauth-page ${mode === "login" ? "skauth-login-compact" : mode === "register" ? "skauth-register-compact" : ""}`} id="main-content">
      <div className="skauth-shell">

        <div className="skauth-brand">
          <div className="skauth-logo-frame">
            <img
              src="/srikalahasti-logo.png"
              alt="Srikalahasti Kalamkari"
              className="skauth-logo"
            />
          </div>

          <strong>SRIKALAHASTI</strong>
          <span>K A L A M K A R I</span>
        </div>

        <div className="skauth-ornament" aria-hidden="true">✦</div>

        <div className="skauth-heading">
          <p className="skauth-overline">
            <ShieldCheck size={14} />
            {isForgot
              ? "ACCOUNT RECOVERY"
              : isRegister
              ? "JOIN OUR HERITAGE"
              : "YOUR HERITAGE ACCOUNT"}
          </p>

          <h1>
            {isForgot
              ? "Forgot password?"
              : isRegister
              ? "Join our atelier."
              : "Welcome back."}
          </h1>

          <p className="skauth-intro">
            {isForgot
                ? "We’ll send a secure link if an account matches your email."
              : isRegister
              ? "Begin your journey with Srikalahasti Kalamkari."
              : "Your favourite pieces and heritage discoveries, all in one place."}
          </p>
        </div>

        <form onSubmit={submit} className="skauth-form">
          {isRegister && (
            <div className="skauth-name-row">
              <label>
              Full name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Your full name"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
            </div>
          )}

          <label>
            Email address
            <div className="skauth-input-wrap">
              <Mail size={17} aria-hidden="true" />
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </div>
          </label>

          {isRegister && <label>Mobile number (optional)<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" pattern="[+0-9 ()-]{10,18}" title="Enter a valid mobile number" /></label>}

          {!isForgot && (
            <label>
              Password
              <div className="skauth-input-wrap">
                <LockKeyhole size={17} aria-hidden="true" />

                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                minLength={isRegister ? 6 : 1}
                placeholder={isRegister ? "Minimum 6 characters" : "Your password"}
                  required
                maxLength={128}
                />

                <button
                  type="button"
                  className="skauth-eye"
                  onClick={() => setVisible(v => !v)}
                  aria-label={visible ? "Hide password" : "Show password"}
                >
                  {visible
                    ? <EyeOff size={18} />
                    : <Eye size={18} />}
                </button>
              </div>
            </label>
          )}

          {isRegister && (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                minLength={6}
                placeholder="Confirm your password"
                required
                maxLength={128}
              />
            </label>
          )}

          {!isRegister && !isForgot && (
            <div className="skauth-forgot">
              <Link href={authHref("/forgot-password")}>
                Forgot password?
              </Link>
            </div>
          )}

          {isRegister && (
            <div className="skauth-terms">
              <label className="skauth-consent">
                <input type="checkbox" name="termsAccepted" required />
                <span>I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.</span>
              </label>
            </div>
          )}

          <button className="skauth-submit" type="submit">
            {busy ? "Please wait…" : isRegister
              ? "Create account"
              : isForgot
              ? "Request password reset"
              : "Sign in"}
            <ArrowRight size={17} />
          </button>

          {error && <div role="alert" className="skauth-notice"><strong>Unable to continue</strong><span>{error}</span></div>}
          {message && (
            <div role="status" className="skauth-notice">
              <strong>{isRegister ? "Account created" : "Request received"}</strong>
              <span>{message} {isRegister && <span className="skauth-confirm-actions"><Link href={authHref("/login")}>Go to sign in</Link><Link href={authHref("/resend-verification")}>Resend verification</Link></span>} {message.includes("verify your email") && <Link href={authHref("/resend-verification")}>Resend verification</Link>}</span>
            </div>
          )}
          {!isRegister && !isForgot && <Link href={authHref("/resend-verification")}>Resend verification email</Link>}
        </form>

        <div className="skauth-switch">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href={authHref("/login")}>Sign in</Link>
            </>
          ) : isForgot ? (
            <>
              Remembered your password?{" "}
              <Link href={authHref("/login")}>Back to sign in</Link>
            </>
          ) : (
            <>
              New to our atelier?{" "}
              <Link href={authHref("/register")}>Create an account</Link>
            </>
          )}
        </div>

        <div className="skauth-back">
          <Link href="/shop">← Back to shop</Link>
          <Link href="/contact">Need help?</Link>
        </div>

        <p className="skauth-copyright">
          © {new Date().getFullYear()} Srikalahasti Kalamkari.
          All rights reserved.
        </p>

      </div>
    </main>
  );
}
