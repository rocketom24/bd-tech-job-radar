import Link from "next/link";
import type { JobSummary } from "@/lib/api-types";
import { cx, deadlineParts, formatDeadline, salaryParts } from "@/lib/utils";
import styles from "./jobs.module.css";

/** Calendar-style deadline block. Tone follows formatDeadline so list and detail agree. */
export function DeadlineStub({ deadline, size = "md" }: { deadline: string | null; size?: "md" | "lg" }) {
  const parts = deadlineParts(deadline);
  const { tone } = formatDeadline(deadline);
  const note = !parts ? null : parts.days < 0 ? "Closed" : parts.days === 0 ? "Today" : parts.days <= 7 ? `${parts.days}d left` : null;
  return (
    <div className={cx(styles.stub, size === "lg" && styles.stubLg, styles[`tone-${tone}`])} aria-hidden>
      {parts ? (
        <>
          <span className={styles.stubMonth}>{parts.month}</span>
          <span className={styles.stubDay}>{parts.day}</span>
          <span className={styles.stubNote}>{note ?? parts.year}</span>
        </>
      ) : (
        <>
          <span className={styles.stubOpen}>Open</span>
          <span className={styles.stubNote}>no deadline</span>
        </>
      )}
    </div>
  );
}

export function VerifiedMark({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return (
    <span className={styles.verified} title="Verified listing">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d="M2.5 6.2l2.4 2.3 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Verified
    </span>
  );
}

export function JobRow({ job, index }: { job: JobSummary; index: number }) {
  const deadline = formatDeadline(job.deadline);
  const pay = salaryParts(job);
  const skills = job.skills.slice(0, 4);
  return (
    <li className={cx(styles.row, deadline.tone === "past" && styles.rowPast)} style={{ ["--i" as string]: Math.min(index, 12) }}>
      <DeadlineStub deadline={job.deadline} />
      <div className={styles.main}>
        <p className={styles.org}>
          <span className={styles.orgName}>{job.organization}</span>
          <VerifiedMark verified={job.verified} />
        </p>
        <h3 className={styles.titleWrap}>
          {/* prefetch={false}: opening a detail page records a view, so it must only happen on a real click */}
          <Link href={`/jobs/${job.id}`} prefetch={false} className={styles.title}>
            {job.title}
          </Link>
        </h3>
        <ul className={styles.meta} aria-label="Job facts">
          <li>{job.location || "Location not listed"}</li>
          {job.category && <li>{job.category}</li>}
          {job.experience && <li>{job.experience}</li>}
          <li className={styles.sector}>{job.sector}</li>
        </ul>
        {skills.length > 0 && (
          <p className={styles.skills}>
            <span className="sr-only">Skills: </span>
            {skills.join(", ")}
            {job.skills.length > skills.length && ` +${job.skills.length - skills.length}`}
          </p>
        )}
      </div>
      <div className={styles.pay}>
        <p className={cx(styles.salary, pay.period === null && styles.salaryPlain)}>{pay.amount}</p>
        {pay.period && <p className={styles.period}>per {pay.period}</p>}
        <p className={cx(styles.deadlineText, styles[`tone-${deadline.tone}`])}>
          {deadline.tone === "ok" ? `Closes in ${deadlineParts(job.deadline)?.days} days` : deadline.label}
          {deadline.tone === "ok" && <span className="sr-only">, {deadline.label}</span>}
        </p>
      </div>
    </li>
  );
}

export function JobRowSkeleton() {
  return (
    <li className={styles.row} aria-hidden>
      <span className={cx("skeleton", styles.stub)} style={{ border: 0 }} />
      <div className={styles.main}>
        <span className="skeleton" style={{ height: 13, width: "30%" }} />
        <span className="skeleton" style={{ height: 22, width: "60%", marginTop: 10 }} />
        <span className="skeleton" style={{ height: 13, width: "45%", marginTop: 12 }} />
      </div>
      <div className={styles.pay}>
        <span className="skeleton" style={{ height: 16, width: "70%", marginLeft: "auto" }} />
        <span className="skeleton" style={{ height: 13, width: "40%", marginLeft: "auto", marginTop: 10 }} />
      </div>
    </li>
  );
}
