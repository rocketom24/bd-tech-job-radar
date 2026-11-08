"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, describeError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { safeNext } from "@/lib/utils";
import styles from "./auth.module.css";

type Mode = "login" | "register";
type Errors = Partial<Record<"email" | "password" | "confirm" | "form", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server 400 `details` is { field: string[] }; surface the first message per known field. */
function serverFieldErrors(error: ApiError): Errors {
  const out: Errors = {};
  const details = error.details as Record<string, unknown> | undefined;
  if (error.code === "VALIDATION_ERROR" && details && typeof details === "object") {
    for (const key of ["email", "password"] as const) {
      const first = Array.isArray(details[key]) ? details[key][0] : undefined;
      if (typeof first === "string") out[key] = first;
    }
  }
  return out;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { status, login, register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false); // blocks double-submits before React re-renders

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  function validate(): Errors {
    const e: Errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
    if (isRegister) {
      if (password.length < 12) e.password = "Use at least 12 characters.";
      else if (password.length > 128) e.password = "Use 128 characters or fewer.";
      if (confirm !== password) e.confirm = "Passwords do not match.";
    } else if (!password) e.password = "Enter your password.";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting.current) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    submitting.current = true;
    setBusy(true);
    try {
      await (isRegister ? register : login)(email.trim(), password);
      router.replace(next);
    } catch (error) {
      const fields = error instanceof ApiError ? serverFieldErrors(error) : {};
      setErrors(Object.keys(fields).length ? fields : { form: describeError(error) });
      submitting.current = false;
      setBusy(false);
    }
  }

  const err = (id: keyof Errors) => (errors[id] ? `${id}-error` : undefined);
  /** Typing into a field clears its own error (and the form-level one); the rest stay until the next submit. */
  const edit = (id: "email" | "password" | "confirm", set: (v: string) => void) => (v: string) => {
    set(v);
    if (errors[id] || errors.form)
      setErrors((e) => {
        const next = { ...e };
        delete next[id];
        delete next.form;
        return next;
      });
  };
  const other = isRegister ? "/login" : "/register";
  const otherQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {errors.form && (
        <div role="alert" className="notice">
          {errors.form}
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => edit("email", setEmail)(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={err("email")}
        />
        {errors.email && (
          <p id="email-error" className="field-error">
            {errors.email}
          </p>
        )}
      </div>

      <div className="field">
        <div className={styles.labelRow}>
          <label className="label" htmlFor="password">
            Password
          </label>
          {isRegister && (
            <span className={`${styles.counter} ${password.length >= 12 ? styles.counterOk : ""}`} aria-hidden>
              {password.length >= 12 ? "Long enough" : `${password.length} / 12`}
            </span>
          )}
        </div>
        <div className={styles.pw}>
          <input
            id="password"
            className="input"
            type={show ? "text" : "password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => edit("password", setPassword)(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={[err("password"), isRegister && !errors.password ? "password-hint" : undefined].filter(Boolean).join(" ") || undefined}
          />
          <button type="button" className={styles.toggle} onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </button>
        </div>
        {isRegister && !errors.password && (
          <p id="password-hint" className="hint">
            At least 12 characters.
          </p>
        )}
        {errors.password && (
          <p id="password-error" className="field-error">
            {errors.password}
          </p>
        )}
      </div>

      {isRegister && (
        <div className="field">
          <label className="label" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            className="input"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => edit("confirm", setConfirm)(e.target.value)}
            aria-invalid={!!errors.confirm}
            aria-describedby={err("confirm")}
          />
          {errors.confirm && (
            <p id="confirm-error" className="field-error">
              {errors.confirm}
            </p>
          )}
        </div>
      )}

      <button type="submit" className={`btn btn-block btn-lg ${styles.submit}`} disabled={busy}>
        {busy && <span className="spinner" aria-hidden />}
        {busy ? (isRegister ? "Creating account…" : "Logging in…") : isRegister ? "Create account" : "Log in"}
      </button>

      <p className={styles.switch}>
        {isRegister ? "Already have an account? " : "New here? "}
        <Link href={`${other}${otherQuery}`}>{isRegister ? "Log in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
