"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Eye, EyeOff, ArrowRight, ShieldCheck,
  Mail, LockKeyhole
} from "lucide-react";
import "./customer-auth.css";

type Mode = "login" | "register" | "forgot";

export default function CustomerAuth({ mode }: { mode: Mode }) {
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState(false);

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(true);
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
              ? "Password recovery will be available when customer accounts launch."
              : isRegister
              ? "Begin your journey with Srikalahasti Kalamkari."
              : "Your favourite pieces and heritage discoveries, all in one place."}
          </p>
        </div>

        <form onSubmit={submit} className="skauth-form">
          {isRegister && (
            <div className="skauth-name-row">
              <label>
                First name
                <input
                  name="firstName"
                  autoComplete="given-name"
                  placeholder="First name"
                  required
                />
              </label>

              <label>
                Last name
                <input
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="Last name"
                  required
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

          {isRegister && (
            <label>
              Mobile number
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+91 98765 43210"
                required
                pattern="[+0-9 ()-]{10,18}"
                title="Enter a valid mobile number"
              />
            </label>
          )}

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
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  required
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
                minLength={8}
                placeholder="Confirm your password"
                required
              />
            </label>
          )}

          {!isRegister && !isForgot && (
            <div className="skauth-forgot">
              <Link href="/forgot-password">
                Forgot password?
              </Link>
            </div>
          )}

          {isRegister && (
            <p className="skauth-terms">
              By continuing, you acknowledge our{" "}
              <Link href="/shipping-policy">Shipping Policy</Link>
              {" "}and{" "}
              <Link href="/refund-policy">Refund Policy</Link>.
            </p>
          )}

          <button className="skauth-submit" type="submit">
            {isRegister
              ? "Create account"
              : isForgot
              ? "Request password reset"
              : "Sign in"}
            <ArrowRight size={17} />
          </button>

          {notice && (
            <div role="status" className="skauth-notice">
              <strong>Customer accounts are not enabled yet.</strong>
              <span>
                This is a design preview. No account was created,
                no sign-in occurred, and no email was sent.
                Please <Link href="/contact">contact our team</Link>
                {" "}for assistance.
              </span>
            </div>
          )}
        </form>

        <div className="skauth-switch">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href="/login">Sign in</Link>
            </>
          ) : isForgot ? (
            <>
              Remembered your password?{" "}
              <Link href="/login">Back to sign in</Link>
            </>
          ) : (
            <>
              New to our atelier?{" "}
              <Link href="/register">Create an account</Link>
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
