import { Suspense } from "react";
import { RadarMark } from "@/components/layout/Header";
import { AuthForm } from "./AuthForm";
import styles from "./auth.module.css";

const COPY = {
  login: {
    title: "Welcome back",
    lead: "Log in to open job details and apply. Jobs you already opened never count against your limit again.",
    points: [],
  },
  register: {
    title: "Create a free account",
    lead: "Browsing and search are open to everyone. An account lets you open full job details and apply on the original site.",
    points: [
      ["10", "job-detail views"],
      ["3", "Apply clicks"],
      ["No limit", "on browsing and search"],
    ],
  },
} as const;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const c = COPY[mode];
  return (
    <div className={`container ${styles.shell}`}>
      <div className={`${styles.intro} enter`}>
        <RadarMark size={36} />
        <h1>{c.title}</h1>
        <p className={styles.lead}>{c.lead}</p>
        {c.points.length > 0 && (
          <dl className={styles.points}>
            {c.points.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className={`${styles.card} enter`} style={{ animationDelay: "80ms" }}>
        <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
          <AuthForm mode={mode} />
        </Suspense>
      </div>
    </div>
  );
}
