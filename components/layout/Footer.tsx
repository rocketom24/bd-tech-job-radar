import Link from "next/link";
import { RadarMark } from "./Header";
import styles from "./layout.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footInner}`}>
        <div className={styles.footBrand}>
          <RadarMark size={18} />
          <p>
            <strong>BD Tech Radar</strong> collects technology jobs from government, banking, NGO and private employers in Bangladesh. Always apply on the original source.
          </p>
        </div>
        <nav className={styles.footLinks} aria-label="Footer">
          <Link href="/">Jobs</Link>
          <Link href="/pricing">Pricing</Link>
          <a href="/docs">API Docs</a>
        </nav>
      </div>
    </footer>
  );
}
