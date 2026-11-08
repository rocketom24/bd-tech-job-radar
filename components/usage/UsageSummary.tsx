"use client";

import Link from "next/link";
import { ArrowRight, Crown, Eye, MousePointerClick, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { UsageCounter } from "@/lib/api-types";
import styles from "./usage.module.css";

function Meter({ label, Icon, counter }: { label: string; Icon: LucideIcon; counter: UsageCounter }) {
  const pct = counter.unlimited || !counter.limit ? 100 : Math.min(100, (counter.used / counter.limit) * 100);
  const full = !counter.unlimited && counter.remaining === 0;
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowLabel}>
          <Icon size={15} aria-hidden />
          {label}
        </span>
        <span className={styles.figure}>
          {counter.unlimited ? `${counter.used} used, no limit` : `${counter.used} of ${counter.limit}`}
        </span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={counter.limit ?? counter.used}
        aria-valuenow={counter.used}
      >
        <span className={`${styles.fill} ${full ? styles.full : ""} ${counter.unlimited ? styles.unlimited : ""}`} style={{ width: `${pct}%` }} />
      </div>
      {!counter.unlimited && (
        <p className={styles.remaining}>{full ? "None left" : `${counter.remaining} left`}</p>
      )}
    </div>
  );
}

/** Usage numbers come straight from GET /api/me/usage; nothing is computed locally. */
export function UsageSummary({ upgradeLink = true }: { upgradeLink?: boolean }) {
  const { status, usage, usageStatus, refreshUsage } = useAuth();

  if (status === "loading") return <div className="skeleton" style={{ height: 96 }} aria-hidden />;
  if (status === "anonymous")
    return (
      <div className={styles.anon}>
        <p>Log in to see how many job views and Apply clicks you have left.</p>
        <div className={styles.actions}>
          <Link href="/login" className="btn btn-sm">
            Log in
          </Link>
          <Link href="/register" className="btn btn-sm btn-ghost">
            Create account
          </Link>
        </div>
      </div>
    );
  if (usageStatus === "error")
    return (
      <div role="alert" className={styles.anon}>
        <p>Usage could not be loaded.</p>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void refreshUsage()}>
          Try again
        </button>
      </div>
    );
  if (!usage)
    return (
      <div aria-busy="true" aria-label="Loading usage" className={styles.loading}>
        <span className="skeleton" style={{ height: 36 }} />
        <span className="skeleton" style={{ height: 36 }} />
      </div>
    );

  return (
    <div className={styles.summary}>
      <p className={styles.planRow}>
        {usage.subscriptionStatus === "PRO" ? (
          <span className={`${styles.plan} ${styles.planPro}`}>
            <Crown size={13} aria-hidden />
            Pro plan
          </span>
        ) : (
          <span className={styles.plan}>Free plan</span>
        )}
      </p>
      <Meter label="Job views" Icon={Eye} counter={usage.jobViews} />
      <Meter label="Apply clicks" Icon={MousePointerClick} counter={usage.applyClicks} />
      {upgradeLink && usage.subscriptionStatus === "FREE" && (
        <Link href="/pricing" className={styles.upgrade}>
          See what Pro adds
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}
