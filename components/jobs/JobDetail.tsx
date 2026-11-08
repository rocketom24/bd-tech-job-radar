"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { api, ApiError, describeError, isAbortError } from "@/lib/api-client";
import type { JobDetail as JobDetailData } from "@/lib/api-types";
import { useAuth } from "@/lib/auth-context";
import { cx, formatDeadline, salaryParts } from "@/lib/utils";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { UpgradeNotice } from "@/components/usage/UpgradeNotice";
import { DeadlineStub, VerifiedMark } from "./JobRow";
import styles from "./detail.module.css";

type Load = { id: string; job: JobDetailData } | { id: string; error: ApiError };

const isHttp = (url: string) => /^https?:\/\//i.test(url);

function ApplyButton({ job }: { job: JobDetailData }) {
  const { refreshUsage, expireSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; href?: string; upgrade?: boolean } | null>(null);

  async function onApply() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    // Open the tab synchronously inside the click, otherwise browsers treat it as a popup after the await.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const res = await api.apply(job.id);
      // Only the URL returned by the backend is ever opened.
      if (!isHttp(res.applyUrl)) throw new ApiError(422, "APPLY_URL_UNAVAILABLE", "No usable application link.");
      void refreshUsage();
      if (tab && !tab.closed) {
        tab.location.href = res.applyUrl;
        // The remaining count is shown once, by ApplyNote below the button, from the refreshed usage.
        setMessage({ kind: "ok", text: "Application page opened in a new tab." });
      } else {
        setMessage({ kind: "ok", text: "Your browser blocked the new tab. Use the link below.", href: res.applyUrl });
      }
    } catch (error) {
      tab?.close();
      if (error instanceof ApiError && error.status === 401) expireSession();
      else if (error instanceof ApiError && error.code === "APPLY_LIMIT_REACHED") void refreshUsage();
      setMessage({ kind: "error", text: describeError(error), upgrade: error instanceof ApiError && error.code === "APPLY_LIMIT_REACHED" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.apply}>
      <div aria-live="polite" className={styles.applyMsg}>
        {message && (
          <p className={message.kind === "error" ? styles.msgError : styles.msgOk} role={message.kind === "error" ? "alert" : undefined}>
            {message.text}{" "}
            {message.href && (
              <a href={message.href} target="_blank" rel="noopener noreferrer" className="link">
                Open application page
              </a>
            )}
            {message.upgrade && (
              <Link href="/pricing" className="link">
                See Pro
              </Link>
            )}
          </p>
        )}
      </div>
      <button type="button" className="btn btn-coral btn-block btn-lg" onClick={onApply} disabled={busy} aria-describedby="apply-note">
        {busy ? (
          <>
            <span className="spinner" aria-hidden /> Opening…
          </>
        ) : (
          <>
            Apply on original site
            <ArrowUpRight size={18} aria-hidden />
          </>
        )}
      </button>
      <ApplyNote />
    </div>
  );
}

/** Apply clicks left, straight from GET /api/me/usage. */
function ApplyNote() {
  const { usage } = useAuth();
  const c = usage?.applyClicks;
  return (
    <p id="apply-note" className={styles.applyNote}>
      <span className={styles.applyNoteLong}>Opens the employer&rsquo;s page in a new tab. </span>
      {c && !c.unlimited && c.remaining !== null && (
        <span className={c.remaining === 0 ? styles.noneLeft : undefined}>
          {c.remaining} of {c.limit} free Apply clicks left.
        </span>
      )}
    </p>
  );
}

function BackLink() {
  return (
    <Link href="/" className={styles.back}>
      <ArrowLeft size={16} aria-hidden /> All jobs
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className={`container ${styles.page}`} aria-busy="true" aria-label="Loading job">
      <span className="skeleton" style={{ height: 14, width: 80 }} />
      <span className="skeleton" style={{ height: 16, width: 200, marginTop: 36 }} />
      <span className="skeleton" style={{ height: 52, width: "min(560px, 90%)", marginTop: 14 }} />
      <span className="skeleton" style={{ height: 40, width: "min(520px, 80%)", marginTop: 24 }} />
      <div className={styles.grid}>
        <div style={{ display: "grid", gap: 12 }}>
          <span className="skeleton" style={{ height: 16 }} />
          <span className="skeleton" style={{ height: 16, width: "92%" }} />
          <span className="skeleton" style={{ height: 16, width: "75%" }} />
        </div>
        <span className="skeleton" style={{ height: 300, borderRadius: 18 }} />
      </div>
    </div>
  );
}

export function JobDetail({ id }: { id: string }) {
  const { status, expireSession, refreshUsage } = useAuth();
  const [load, setLoad] = useState<Load | null>(null);
  const [attempt, setAttempt] = useState(0);
  const authed = status === "authenticated";

  // The detail request is the one that records the view. It only runs here, after an intentional open.
  useEffect(() => {
    if (!authed) return;
    const c = new AbortController();
    api
      .jobDetail(id, c.signal)
      .then((job) => {
        setLoad({ id, job });
        void refreshUsage();
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        const error = e instanceof ApiError ? e : new ApiError(0, "NETWORK_ERROR", describeError(e));
        if (error.status === 401) expireSession();
        else {
          setLoad({ id, error });
          if (error.code === "VIEW_LIMIT_REACHED") void refreshUsage();
        }
      });
    return () => c.abort();
  }, [authed, id, attempt, expireSession, refreshUsage]);

  const retry = useCallback(() => {
    setLoad(null);
    setAttempt((a) => a + 1);
  }, []);

  if (status === "loading") return <DetailSkeleton />;
  if (status === "anonymous") {
    const next = encodeURIComponent(`/jobs/${id}`);
    return (
      <div className={`container ${styles.page}`}>
        <BackLink />
        <div className={styles.gateWrap}>
          <section className={cx(styles.gate, "enter")} aria-labelledby="gate-title">
            <h1 id="gate-title">Log in to open this job</h1>
            <p>
              Searching the job list is open to everyone. The full description, source and Apply link need a free account, which includes 10 job views
              and 3 Apply clicks.
            </p>
            <div className={styles.row}>
              <Link href={`/login?next=${next}`} className="btn">
                Log in
              </Link>
              <Link href={`/register?next=${next}`} className="btn btn-ghost">
                Create free account
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }
  if (!load || load.id !== id) return <DetailSkeleton />;

  if ("error" in load) {
    const { error } = load;
    return (
      <div className={`container ${styles.page}`}>
        <BackLink />
        {error.code === "VIEW_LIMIT_REACHED" ? (
          <UpgradeNotice title="You have used all 10 free job views">
            Jobs you already opened stay available, so you can go back to them any time. Opening new ones needs Pro, which has no view limit.
          </UpgradeNotice>
        ) : error.status === 404 || error.code === "INVALID_JOB_ID" ? (
          <EmptyState title="Job not found" action={<Link href="/" className="btn btn-ghost">Browse all jobs</Link>}>
            This job does not exist or has been removed.
          </EmptyState>
        ) : error.status === 403 ? (
          <ErrorState title="Access denied">Your account cannot open this job. Contact support if this looks wrong.</ErrorState>
        ) : (
          <ErrorState title="Job could not be loaded" onRetry={retry}>
            {describeError(error)}
          </ErrorState>
        )}
      </div>
    );
  }

  const { job } = load;
  const deadline = formatDeadline(job.deadline);
  const pay = salaryParts(job);
  const sourceUrl = isHttp(job.source.url) ? job.source.url : null;
  const facts = [
    { label: "Location", value: job.location },
    { label: "Category", value: job.category },
    { label: "Experience", value: job.experience },
    { label: "Sector", value: job.sector },
  ];

  return (
    <article className={`container ${styles.page}`}>
      <BackLink />
      <header className={cx(styles.head, "enter")}>
        <p className={styles.org}>
          <span>{job.organization}</span>
          <VerifiedMark verified={job.verified} />
        </p>
        <h1>{job.title}</h1>
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value || "Not listed"}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className={styles.grid}>
        <aside className={cx(styles.aside, "enter")} style={{ animationDelay: "80ms" }} aria-label="Salary, deadline and apply">
          <div className={styles.summary}>
            <div className={styles.money}>
              <p className={styles.asideLabel}>Salary</p>
              <p className={cx(styles.salary, pay.period === null && styles.salaryPlain)}>{pay.amount}</p>
              {pay.period && <p className={styles.period}>per {pay.period}</p>}
            </div>
            <div className={styles.when}>
              <DeadlineStub deadline={job.deadline} size="lg" />
              <div className={styles.whenText}>
                <p className={styles.asideLabel}>Deadline</p>
                <p className={cx(styles.deadline, deadline.tone === "soon" && styles.soon, deadline.tone === "past" && styles.past)}>{deadline.label}</p>
              </div>
            </div>
          </div>
          <ApplyButton job={job} />
        </aside>

        <div className={cx(styles.body, "enter")} style={{ animationDelay: "140ms" }}>
          <section aria-labelledby="about-title">
            <h2 id="about-title">About the role</h2>
            {job.description.trim() ? <p className={styles.desc}>{job.description}</p> : <p className="muted">No description was provided.</p>}
          </section>
          {job.skills.length > 0 && (
            <section aria-labelledby="skills-title">
              <h2 id="skills-title">Skills asked for</h2>
              <ul className={styles.skills}>
                {job.skills.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="source-title" className={styles.source}>
            <h2 id="source-title">Source</h2>
            <p>
              Published by{" "}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
                  {job.source.name}
                </a>
              ) : (
                <strong>{job.source.name}</strong>
              )}
              .{" "}
              {job.verified
                ? "Marked as a verified listing."
                : "This listing is not verified. Check the details on the source before you apply."}
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
