import type { Metadata } from "next";
import { PlanCta } from "@/components/usage/PlanCta";
import { UsageSummary } from "@/components/usage/UsageSummary";
import styles from "./pricing.module.css";

export const metadata: Metadata = { title: "Pricing" };

/** What each plan allows. Mirrors the server-side entitlements; nothing here is enforced client-side. */
const ROWS: { label: string; note?: string; free: string; pro: string }[] = [
  { label: "Browse and search listings", free: "No limit", pro: "No limit" },
  { label: "Open job details", note: "Unique jobs, for the life of the account", free: "10", pro: "No limit" },
  { label: "Apply clicks", note: "Opens the employer’s application page", free: "3", pro: "No limit" },
  { label: "Reopen a job you already viewed", free: "Free", pro: "Free" },
];

export default function PricingPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={`${styles.head} enter`}>
        <h1>Start free. Pro will remove the limits.</h1>
        <p>Browsing is always unlimited. Plans only change how many job details you can open and how many times you can apply.</p>
      </header>

      <div className={`${styles.tableWrap} enter`} style={{ animationDelay: "80ms" }}>
        <table className={styles.table}>
          <caption className="sr-only">Free and Pro plans compared</caption>
          <thead>
            <tr>
              <td />
              <th scope="col">
                <span className={styles.planName}>Free</span>
                <span className={styles.price}>Tk 0</span>
                <span className={styles.planNote}>Every new account starts here</span>
              </th>
              <th scope="col" className={styles.pro}>
                <span className={styles.planName}>
                  Pro <span className={styles.badge}>Not on sale yet</span>
                </span>
                <span className={`${styles.price} ${styles.priceTbd}`}>Price not set</span>
                <span className={styles.planNote}>Planned. No payment is taken anywhere on this site.</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <th scope="row">
                  {r.label}
                  {r.note && <span className={styles.rowNote}>{r.note}</span>}
                </th>
                <td data-plan="Free">{r.free}</td>
                <td className={styles.pro} data-plan="Pro">{r.pro}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>
                <PlanCta plan="FREE" />
              </td>
              <td className={styles.pro}>
                <PlanCta plan="PRO" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className={styles.usage} aria-labelledby="usage-title">
        <div>
          <h2 id="usage-title">Your usage</h2>
          <p>Counted on the server each time you open a new job or click Apply.</p>
        </div>
        <div className={styles.usageBox}>
          <UsageSummary upgradeLink={false} />
        </div>
      </section>
    </div>
  );
}
