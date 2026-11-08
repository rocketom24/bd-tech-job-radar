"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

/** Call to action for one plan card. There is no payment flow: PRO cannot be bought here. */
export function PlanCta({ plan }: { plan: "FREE" | "PRO" }) {
  const { status, user } = useAuth();
  const current = status === "authenticated" ? user?.subscriptionStatus : null;

  if (current === plan) return <span className="btn btn-ghost btn-block" aria-disabled="true">Your current plan</span>;
  if (plan === "FREE") {
    if (status === "authenticated") return <span className="btn btn-ghost btn-block" aria-disabled="true">Included in Pro</span>;
    return (
      <Link href="/register" className="btn btn-block">
        Create free account
      </Link>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-coral btn-block" aria-disabled="true" onClick={(e) => e.preventDefault()}>
        Pro is coming soon
      </button>
      <p className="hint" style={{ marginTop: 10 }}>
        This is a demo. Pro cannot be purchased yet and no payment is taken.
      </p>
    </>
  );
}
