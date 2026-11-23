"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import "@/components/customer-auth.css";

type VerificationState = "loading" | "verified" | "already-verified" | "invalid" | "expired" | "failed" | "timeout" | "unavailable";

export default function VerifyEmailPage() {
  const [state, setState] = useState<VerificationState>("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const attempt = useRef<Promise<VerificationState> | null>(null);
  const timeoutMs = 12_000;

  useEffect(() => {
    if (!attempt.current) {
      const token = new URLSearchParams(window.location.search).get("token") || "";
      if (!token) {
        attempt.current = Promise.resolve("invalid");
      } else {
        const controller = new AbortController();
        let timedOut = false;
        const timeout = window.setTimeout(() => {
          timedOut = true;
          controller.abort(new DOMException("Verification timed out", "TimeoutError"));
        }, timeoutMs);
        attempt.current = fetch("/api/customer/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
          signal: controller.signal,
        }).then(async response => {
          const result = await response.json();
          if (!response.ok) return result.code === "expired" ? "expired" : result.code === "unavailable" || response.status >= 500 ? "unavailable" : "invalid";
          return result.alreadyVerified ? "already-verified" : "verified";
        }).catch(() => timedOut ? "timeout" : "failed").finally(() => window.clearTimeout(timeout));
      }
    }
    void attempt.current.then(setState);
  }, [retryNonce]);

  const isSuccess = state === "verified" || state === "already-verified";
  const copy: Record<VerificationState, { title: string; detail: string }> = {
    loading: { title: "Verifying your email…", detail: "Please wait while we confirm your email address securely." },
    verified: { title: "Email verified successfully", detail: "Your account is ready. Sign in to continue shopping." },
    "already-verified": { title: "Already verified", detail: "This email address is already verified. You can sign in to your account." },
    invalid: { title: "Link expired or invalid", detail: "This verification link cannot be used. Request a new link to continue." },
    expired: { title: "Link expired or invalid", detail: "This verification link has expired. Request a new link to continue." },
    failed: { title: "Unable to verify", detail: "We could not reach the verification service. Please try again in a moment." },
    timeout: { title: "Verification is taking too long", detail: "We could not confirm the result in time. Your email may already be verified. Check again safely, or request a new link if needed." },
    unavailable: { title: "Verification is temporarily unavailable", detail: "The verification service could not reach the account database. Please try again shortly." },
  };

  return (
    <main className="skauth-page skauth-result-page" id="main-content">
      <section className="skauth-shell skauth-result-card" aria-labelledby="verification-title">
        <div className="skauth-brand">
          <div className="skauth-logo-frame"><img src="/srikalahasti-logo.png" alt="" className="skauth-logo" /></div>
          <strong>SRIKALAHASTI</strong><span>K A L A M K A R I</span>
        </div>
        <div className={`skauth-result-icon ${isSuccess ? "is-success" : state === "loading" ? "is-loading" : "is-error"}`} aria-hidden="true">
          {state === "loading" ? <LoaderCircle size={29} /> : isSuccess ? <CheckCircle2 size={30} /> : <CircleAlert size={30} />}
        </div>
        <p className="skauth-overline"><ShieldCheck size={14} /> SECURE ACCOUNT VERIFICATION</p>
        <h1 id="verification-title" aria-live="polite">{copy[state].title}</h1>
        <p className="skauth-result-copy" role="status">{copy[state].detail}</p>
        <div className="skauth-result-actions">
          {isSuccess ? <Link className="skauth-submit skauth-result-button" href="/login">Continue to Sign In</Link> : <>
            {(state === "failed" || state === "timeout" || state === "unavailable") && <button className="skauth-submit skauth-result-button" type="button" onClick={() => { attempt.current = null; setRetryNonce(value => value + 1); }}>Try Again</button>}
            {(state === "invalid" || state === "expired") && <Link className="skauth-submit skauth-result-button" href="/resend-verification">Request New Verification Email</Link>}
            <Link className="skauth-secondary-button" href="/login">Back to Sign In</Link>
          </>}
        </div>
      </section>
    </main>
  );
}
