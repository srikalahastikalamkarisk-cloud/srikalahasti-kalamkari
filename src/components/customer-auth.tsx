"use client";

import { useState, useEffect, type FormEvent } from "react";
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
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpStage, setOtpStage] = useState<"phone" | "code">("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequestId, setOtpRequestId] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLinkRequired, setOtpLinkRequired] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [emailLoginEnabled, setEmailLoginEnabled] = useState(true);
  const [otpName, setOtpName] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpTerms, setOtpTerms] = useState(false);
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

  useEffect(() => {
    if (resendSeconds < 1) return;
    const timer = window.setTimeout(() => setResendSeconds(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (mode !== "login" && mode !== "register") return;
    let active = true;
    void fetch("/api/customer/otp/status", { cache: "no-store" }).then(response => response.json()).then(data => { if (active) { setOtpEnabled(data.mobileOtp === true); setEmailLoginEnabled(data.emailPassword !== false); } }).catch(() => { if (active) { setOtpEnabled(false); setEmailLoginEnabled(true); } });
    return () => { active = false; };
  }, [mode]);

  async function sendOtp() {
    const digits = otpPhone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(digits)) { setOtpError("Enter a valid 10-digit Indian mobile number."); return; }
    setOtpBusy(true); setOtpError(""); setOtpMessage("");
    try {
      const gate = await fetch("/api/customer/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: `91${digits}`, action: "send" }) });
      const payload = await gate.json();
      if (!gate.ok || typeof payload.requestId !== "string") throw new Error(payload.error || "Too many requests. Please wait before trying again.");
      setOtpRequestId(payload.requestId);
      setOtpPhone(digits); setOtpStage("code"); setResendSeconds(60); setOtpMessage(`Enter the code sent to +91 ${digits}.`);
    } catch (cause) { setOtpError(cause instanceof Error ? cause.message : "Unable to send a code. Please try again."); }
    finally { setOtpBusy(false); }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otpCode)) { setOtpError("Enter the 6-digit code."); return; }
    if (mode === "register" && (!otpTerms || otpName.trim().length < 2 || (otpEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpEmail.trim())))) { setOtpError("Enter your name, a valid optional email, and accept the Terms and Privacy Policy."); return; }
    setOtpBusy(true); setOtpError("");
    try {
      const response = await fetch("/api/customer/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: `+91${otpPhone}`, otp: otpCode, requestId: otpRequestId, ...(mode === "register" ? { flow: "register", name: otpName, email: otpEmail } : {}) }) });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "ACCOUNT_LINK_REQUIRED") {
          setOtpLinkRequired(true);
          setOtpCode("");
          setOtpRequestId("");
          setOtpMessage("");
          return;
        }
        throw new Error(payload.error || "Unable to sign in with that number.");
      }
      router.replace(checkoutReturn || "/account"); router.refresh();
    } catch (cause) { setOtpError(cause instanceof Error ? cause.message : "The code could not be verified."); }
    finally { setOtpBusy(false); }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (otpOpen) return;
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
          {(mode === "login" || mode === "register") && otpOpen ? <section className="skauth-otp" aria-label={mode === "register" ? "Create an account with mobile OTP" : "Mobile OTP sign in"}>
            {mode === "register" && <><label>Full name<input value={otpName} onChange={event => setOtpName(event.target.value)} autoComplete="name" maxLength={120} /></label><label>Email address (optional)<input value={otpEmail} onChange={event => setOtpEmail(event.target.value)} type="email" autoComplete="email" maxLength={191} /></label><label className="skauth-consent skauth-otp-terms"><input type="checkbox" checked={otpTerms} onChange={event => setOtpTerms(event.target.checked)} /><span>I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.</span></label></>}
            <label>Indian mobile number<div className="skauth-otp-phone"><span>+91</span><input value={otpPhone} onChange={event => setOtpPhone(event.target.value)} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="Enter mobile number" disabled={otpStage === "code"} /></div></label>
            {otpStage === "code" && <label>6-digit verification code<input value={otpCode} onChange={event => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" /></label>}
            {otpMessage && !otpLinkRequired && <p role="status">{otpMessage}</p>}{otpError && <p role="alert">{otpError}</p>}
            {otpLinkRequired ? <div className="skauth-notice skauth-link-notice" role="alert">
              <strong>Already have an account?</strong>
              <span>If you registered using email, sign in with your email and password first. Open My Profile and verify your mobile number. Once linked, you can sign in using mobile OTP.</span>
              {emailLoginEnabled && <Link href={authHref("/login")} onClick={() => { setOtpOpen(false); setOtpLinkRequired(false); setOtpStage("phone"); setOtpError(""); }}>Sign in with Email</Link>}
              <Link href="/contact">Need help? Contact support</Link>
              <button type="button" onClick={() => { setOtpLinkRequired(false); setOtpStage("phone"); setOtpPhone(""); setOtpError(""); }}>Use another mobile number</button>
            </div> : otpStage === "phone" ? <button type="button" disabled={otpBusy} onClick={sendOtp}>{otpBusy ? "Sending…" : "Send OTP"}</button> : <><button type="button" disabled={otpBusy} onClick={verifyOtp}>{otpBusy ? "Verifying…" : mode === "register" ? "Verify and create account" : "Verify and sign in"}</button><button type="button" disabled={otpBusy || resendSeconds > 0} onClick={async () => { setOtpBusy(true); setOtpError(""); try { const gate = await fetch("/api/customer/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: `91${otpPhone}`, action: "resend", requestId: otpRequestId }) }); const payload = await gate.json(); if (!gate.ok) throw new Error(payload.error || "Unable to resend the code."); if (typeof payload.requestId === "string") setOtpRequestId(payload.requestId); setResendSeconds(60); } catch (cause) { setOtpError(cause instanceof Error ? cause.message : "Unable to resend the code. Please try again."); } finally { setOtpBusy(false); } }}>{resendSeconds ? `Resend in ${resendSeconds}s` : "Resend code"}</button><button type="button" disabled={otpBusy} onClick={() => { setOtpStage("phone"); setOtpCode(""); setOtpRequestId(""); setOtpError(""); }}>Change number</button></>}
          </section> : null}
          {(!otpOpen && (emailLoginEnabled || isForgot)) && <>
          {isRegister && (
            <div className="skauth-name-row" hidden={!emailLoginEnabled}>
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

          <label hidden={!emailLoginEnabled}>
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

          {isRegister && <label hidden={!emailLoginEnabled}>Mobile number (optional)<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" pattern="[+0-9 ()-]{10,18}" title="Enter a valid mobile number" /></label>}

          {!isForgot && (
            <label hidden={!emailLoginEnabled}>
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
            <label hidden={!emailLoginEnabled}>
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

          <button className="skauth-submit" type="submit" hidden={!emailLoginEnabled}>
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
          </>}
        </form>
        {otpOpen && emailLoginEnabled && <button type="button" className="skauth-otp-toggle" onClick={() => { setOtpOpen(false); setOtpLinkRequired(false); setOtpError(""); setOtpMessage(""); setOtpStage("phone"); setOtpCode(""); setOtpRequestId(""); }}>Use email and password instead</button>}
        {(mode === "login" || mode === "register") && otpEnabled && !otpOpen && <button type="button" className="skauth-otp-toggle" onClick={() => { setOtpOpen(true); setOtpError(""); setOtpLinkRequired(false); }}> {mode === "register" ? "Create account with mobile OTP" : "Sign in with mobile OTP"}</button>}

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
