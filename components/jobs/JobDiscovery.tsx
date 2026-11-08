"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import { api, describeError, isAbortError } from "@/lib/api-client";
import type { JobSummary } from "@/lib/api-types";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { formatDeadline } from "@/lib/utils";
import { JobRow, JobRowSkeleton } from "./JobRow";
import styles from "./jobs.module.css";

/** Follows `value` after `ms`; an emptied field applies immediately so Clear feels instant. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return value === "" ? "" : debounced;
}

type Result = { key: string; jobs: JobSummary[] } | { key: string; error: string };
type Stats = { total: number; employers: number; closingSoon: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function JobDiscovery() {
  const params = useSearchParams();
  const [keyword, setKeyword] = useState(() => params.get("keyword") ?? "");
  const [location, setLocation] = useState(() => params.get("location") ?? "");
  const [category, setCategory] = useState(() => params.get("category") ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [options, setOptions] = useState<{ categories: string[]; locations: string[]; stats: Stats | null }>({ categories: [], locations: [], stats: null });
  const [attempt, setAttempt] = useState(0);

  const dKeyword = useDebounced(keyword, 300);
  const dLocation = useDebounced(location, 300);
  const key = JSON.stringify([dKeyword.trim(), dLocation.trim(), category]);
  const filtered = !!(dKeyword.trim() || dLocation.trim() || category);
  const anyInput = !!(keyword || location || category);
  const initialFiltered = useRef(filtered);

  const learnOptions = (jobs: JobSummary[]) =>
    setOptions({
      categories: [...new Set(jobs.map((j) => j.category).filter(Boolean))].sort(),
      locations: [...new Set(jobs.map((j) => j.location).filter(Boolean))].sort(),
      stats: {
        total: jobs.length,
        employers: new Set(jobs.map((j) => j.organization)).size,
        closingSoon: jobs.filter((j) => formatDeadline(j.deadline).tone === "soon").length,
      },
    });

  // Filter choices come from the unfiltered dataset; if the page opened with filters, fetch it once.
  useEffect(() => {
    if (!initialFiltered.current) return;
    const c = new AbortController();
    api.jobs({}, c.signal).then(learnOptions, () => {});
    return () => c.abort();
  }, []);

  useEffect(() => {
    const c = new AbortController();
    const [kw, loc, cat] = JSON.parse(key) as [string, string, string];
    api
      .jobs({ keyword: kw, location: loc, category: cat }, c.signal)
      .then((jobs) => {
        setResult({ key, jobs });
        if (!kw && !loc && !cat) learnOptions(jobs);
      })
      .catch((e) => {
        if (!isAbortError(e)) setResult({ key, error: describeError(e) });
      });
    return () => c.abort();
  }, [key, attempt]);

  // Keep the URL shareable without triggering navigation.
  useEffect(() => {
    const [kw, loc, cat] = JSON.parse(key) as [string, string, string];
    const q = new URLSearchParams();
    if (kw) q.set("keyword", kw);
    if (loc) q.set("location", loc);
    if (cat) q.set("category", cat);
    window.history.replaceState(null, "", q.size ? `/?${q}` : "/");
  }, [key]);

  const loading = result === null || result.key !== key;
  const jobs = result && "jobs" in result ? result.jobs : null;
  const error = result && "error" in result && !loading ? result.error : null;
  const categories = useMemo(() => (category && !options.categories.includes(category) ? [category, ...options.categories] : options.categories), [options.categories, category]);

  const clearAll = () => {
    setKeyword("");
    setLocation("");
    setCategory("");
  };

  const { stats } = options;
  const countText = error ? "" : !jobs ? "Loading jobs…" : filtered ? `${plural(jobs.length, "job")} ${jobs.length === 1 ? "matches" : "match"}` : `${plural(jobs.length, "job")}`;

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={`container ${styles.heroWrap}`}>
          <div className={styles.heroPanel}>
          <h1 id="hero-title" className={`${styles.heroTitle} enter`}>
            Tech jobs in Bangladesh, <span className={styles.heroAccent}>from government circulars to startup teams.</span>
          </h1>
          <p className={`${styles.lead} enter`} style={{ animationDelay: "60ms" }}>
            {stats ? (
              <>
                <strong>{plural(stats.total, "open listing")}</strong> from {plural(stats.employers, "employer")}
                {stats.closingSoon > 0 && (
                  <>
                    , <span className={styles.leadSoon}>{stats.closingSoon} closing within a week</span>
                  </>
                )}
                . Search them all, then open the ones worth your time.
              </>
            ) : (
              <>Government, banking, NGO and private-sector tech roles, searchable in one list.</>
            )}
          </p>

          <form className={`${styles.search} enter`} style={{ animationDelay: "120ms" }} role="search" onSubmit={(e) => e.preventDefault()}>
            <div className={styles.searchCell}>
              <label htmlFor="keyword" className={styles.searchLabel}>
                What
              </label>
              <Search size={18} className={styles.searchIcon} aria-hidden />
              <input
                id="keyword"
                type="search"
                className={styles.searchInput}
                placeholder="Title, organization or skill"
                value={keyword}
                maxLength={100}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => setKeyword(e.target.value)}
              />
              {keyword && (
                <button type="button" className={styles.clearX} aria-label="Clear search" onClick={() => setKeyword("")}>
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>
            <div className={`${styles.searchCell} ${styles.searchWhere}`}>
              <label htmlFor="location" className={styles.searchLabel}>
                Where
              </label>
              <MapPin size={18} className={styles.searchIcon} aria-hidden />
              <input
                id="location"
                className={styles.searchInput}
                placeholder="Any city, or Remote"
                list="location-options"
                value={location}
                maxLength={100}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => setLocation(e.target.value)}
              />
              {location && (
                <button type="button" className={styles.clearX} aria-label="Clear location" onClick={() => setLocation("")}>
                  <X size={16} aria-hidden />
                </button>
              )}
              <datalist id="location-options">
                {options.locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
          </form>
          </div>
        </div>
      </section>

      <section aria-labelledby="results-title">
        <h2 id="results-title" className="sr-only">
          Job results
        </h2>
        <div className={styles.toolbar}>
          <div className={`container ${styles.toolbarInner}`}>
            <div className={styles.chips} role="group" aria-label="Category">
              <button type="button" className={styles.chip} aria-pressed={category === ""} onClick={() => setCategory("")}>
                All
              </button>
              {categories.map((c) => (
                <button key={c} type="button" className={styles.chip} aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className={styles.status}>
              <p className={styles.count} role="status" aria-live="polite">
                {loading && jobs && <span className="spinner" aria-hidden />}
                {countText}
              </p>
              {anyInput && (
                <button type="button" className={styles.clearAll} onClick={clearAll}>
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="container">
          {error ? (
            <ErrorState
              title="Jobs could not be loaded"
              onRetry={() => {
                setResult(null);
                setAttempt((a) => a + 1);
              }}
            >
              {error}
            </ErrorState>
          ) : !jobs ? (
            <ul className={styles.list} aria-busy="true" aria-label="Loading jobs">
              {Array.from({ length: 6 }, (_, i) => (
                <JobRowSkeleton key={i} />
              ))}
            </ul>
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No jobs match these filters"
              action={
                <button type="button" className="btn btn-ghost" onClick={clearAll}>
                  Clear all filters
                </button>
              }
            >
              Nothing matches
              {dKeyword.trim() && <> &ldquo;{dKeyword.trim()}&rdquo;</>}
              {dLocation.trim() && <> in {dLocation.trim()}</>}
              {category && <> under {category}</>}. Try a shorter keyword, another city, or all categories.
            </EmptyState>
          ) : (
            // Remount on a new result set so the staggered reveal replays for the new list.
            <ul key={result?.key} className={styles.list} aria-busy={loading}>
              {jobs.map((job, i) => (
                <JobRow key={job.id} job={job} index={i} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
