"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { BookOpen, Briefcase, ChevronDown, LogOut, Menu, Tag, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { describeError } from "@/lib/api-client";
import { cx, initials } from "@/lib/utils";
import { UsageSummary } from "@/components/usage/UsageSummary";
import styles from "./layout.module.css";

const NAV = [
  { href: "/", label: "Jobs", Icon: Briefcase },
  { href: "/pricing", label: "Pricing", Icon: Tag },
];

export function RadarMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="radar-mark" width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="10" fill="none" stroke="var(--brown)" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="5.5" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" />
      <path d="M11 11L11 1A10 10 0 0 1 20.4 7.6Z" fill="var(--coral)" opacity="0.85" />
      <circle cx="11" cy="11" r="1.6" fill="var(--ink)" />
    </svg>
  );
}

function Avatar({ email, size = "sm" }: { email: string; size?: "sm" | "lg" }) {
  return (
    <span className={cx(styles.avatar, size === "lg" && styles.avatarLg)} aria-hidden>
      {initials(email)}
    </span>
  );
}

/** Avatar, "Signed in as" and the email: the top of both the desktop panel and the mobile menu. */
function Identity({ email }: { email: string }) {
  return (
    <div className={styles.identity}>
      <Avatar email={email} size="lg" />
      <div className={styles.identityText}>
        <span className={styles.identityLabel}>Signed in as</span>
        <span className={styles.identityEmail} title={email}>
          {email}
        </span>
      </div>
    </div>
  );
}

function LogoutButton({ onDone }: { onDone?: () => void }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={cx(styles.item, styles.itemLogout)}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await logout();
            onDone?.();
            router.push("/");
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <span className="spinner" aria-hidden /> : <LogOut size={16} aria-hidden />}
        {busy ? "Logging out…" : "Log out"}
      </button>
      {error && (
        <p role="alert" className={cx("field-error", styles.itemError)}>
          {error}
        </p>
      )}
    </>
  );
}

/** Disclosure (not an ARIA menu): the panel holds usage meters as well as links. */
function AccountMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Tabbing past the last item closes the panel.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  };

  if (!user) return null;
  return (
    <div className={styles.account} ref={ref} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.accountBtn}
        aria-expanded={open}
        aria-controls="account-panel"
        aria-label={`Account menu for ${user.email}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar email={user.email} />
        <span className={styles.accountEmail} aria-hidden>
          {user.email}
        </span>
        <ChevronDown size={16} className={cx(styles.chev, open && styles.chevOpen)} aria-hidden />
      </button>
      {/* Stays mounted so it can animate out; `inert` keeps it out of focus and the a11y tree while closed. */}
      <div id="account-panel" className={styles.panel} data-open={open} inert={!open}>
        <Identity email={user.email} />
        <div className={styles.panelUsage}>
          <UsageSummary upgradeLink={false} />
        </div>
        <nav className={styles.items} aria-label="Account">
          <Link href="/pricing" className={styles.item} onClick={() => setOpen(false)}>
            <Tag size={16} aria-hidden />
            Plans &amp; pricing
          </Link>
          <a href="/docs" className={styles.item}>
            <BookOpen size={16} aria-hidden />
            API documentation
          </a>
        </nav>
        <div className={styles.items}>
          <LogoutButton onDone={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname; // navigating closes the mobile menu
  const [scrolled, setScrolled] = useState(false);

  // Header gains a soft shadow once the page scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuFor(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className={styles.header} data-scrolled={scrolled || menuOpen}>
      <div className={cx("container", styles.bar)}>
        <Link href="/" className={styles.logo} aria-label="BD Tech Radar home">
          <RadarMark />
          <span>
            BD Tech <span className={styles.logoAccent}>Radar</span>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <a href="/docs">API Docs</a>
        </nav>

        <div className={styles.right}>
          {status === "loading" && <span className={cx("skeleton", styles.authSkeleton)} aria-hidden />}
          {status === "anonymous" && (
            <>
              <Link href="/login" className={styles.loginLink}>
                Log in
              </Link>
              <Link href="/register" className="btn btn-sm">
                Register
              </Link>
            </>
          )}
          {status === "authenticated" && <AccountMenu />}
        </div>

        <button
          type="button"
          className={styles.burger}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuFor(menuOpen ? null : pathname)}
        >
          <span key={String(menuOpen)} className={styles.burgerIcon}>
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </span>
        </button>
      </div>

      {/* Stays mounted so it can slide open and closed; `inert` hides it from focus and the a11y tree while closed. */}
      <div id="mobile-menu" className={styles.mobile} data-open={menuOpen} inert={!menuOpen}>
        <div className={styles.mobileClip}>
          <div className={styles.mobileInner}>
          {status === "authenticated" && user && (
            <section className={styles.mobileAccount} aria-label="Account">
              <Identity email={user.email} />
              <UsageSummary upgradeLink={false} />
            </section>
          )}
          <nav aria-label="Mobile" className={styles.mobileNav}>
            {NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className={styles.item} aria-current={pathname === href ? "page" : undefined} onClick={() => setMenuFor(null)}>
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            ))}
            <a href="/docs" className={styles.item}>
              <BookOpen size={18} aria-hidden />
              API Docs
            </a>
          </nav>
          {status === "anonymous" && (
            <div className={styles.mobileAuth}>
              <Link href="/login" className="btn btn-ghost" onClick={() => setMenuFor(null)}>
                Log in
              </Link>
              <Link href="/register" className="btn" onClick={() => setMenuFor(null)}>
                Register
              </Link>
            </div>
          )}
          {status === "authenticated" && user && (
            <div className={styles.mobileLogout}>
              <LogoutButton onDone={() => setMenuFor(null)} />
            </div>
          )}
          </div>
        </div>
      </div>
    </header>
  );
}
