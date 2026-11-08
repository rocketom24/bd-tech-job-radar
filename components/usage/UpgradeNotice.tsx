import Link from "next/link";
import { UsageSummary } from "./UsageSummary";
import styles from "./usage.module.css";

export function UpgradeNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${styles.upgradeNotice} enter`} role="alert" aria-labelledby="limit-title">
      <div className={styles.upgradeText}>
        <h2 id="limit-title">{title}</h2>
        <p>{children}</p>
        <div className={styles.actions}>
          <Link href="/pricing" className="btn btn-coral">
            Compare plans
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back to all jobs
          </Link>
        </div>
      </div>
      <div className={styles.upgradeUsage}>
        <UsageSummary />
      </div>
    </section>
  );
}
