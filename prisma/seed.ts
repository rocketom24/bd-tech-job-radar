import "dotenv/config";
import { prisma } from "../lib/prisma";
import type { JobSourceType } from "../generated/prisma/client";
import { salarySchema, type SalaryInput } from "../lib/schemas";

// Synthetic demo data only. Not real vacancies. All URLs use reserved example.com.
// Idempotency: sources are matched on url, jobs on sourceUrl (findFirst), then
// update-or-create. Neither column is unique, so Prisma upsert is not usable.
// Seed never deletes anything and only touches rows matching its own demo URLs.

type SourceSeed = { key: string; name: string; type: JobSourceType; url: string };
type JobSeed = {
  src: string;
  slug: string;
  title: string;
  org: string;
  sector: "Government" | "Private" | "Banking" | "University" | "NGO";
  category: string;
  location: string;
  salary: string;
  experience: string;
  skills: string[];
  deadline: string | null; // ISO date
  verified: boolean;
  created: string; // ISO date
  desc: string;
};

const SOURCES: SourceSeed[] = [
  { key: "gov", name: "Demo Government Jobs Portal", type: "GOVERNMENT", url: "https://demo-gov-jobs.example.com" },
  { key: "pvt", name: "Demo Private Tech Careers", type: "COMPANY", url: "https://demo-private-careers.example.com" },
  { key: "bank", name: "Demo Banking & Fintech Careers", type: "COMPANY", url: "https://demo-banking-careers.example.com" },
  { key: "uni", name: "Demo University Careers", type: "UNIVERSITY", url: "https://demo-university-careers.example.com" },
  { key: "ngo", name: "Demo NGO Careers", type: "NGO", url: "https://demo-ngo-careers.example.com" },
];

const JOBS: JobSeed[] = [
  // Government (5)
  { src: "gov", slug: "it-officer-ministry", title: "IT Officer", org: "Demo Ministry of Digital Services", sector: "Government", category: "IT & Systems", location: "Dhaka", salary: "Tk 35,500 - 67,010 (Grade 9)", experience: "2+ years", skills: ["Networking", "Linux", "Technical Support", "Documentation"], deadline: "2026-12-20", verified: true, created: "2026-10-02", desc: "Maintain office networks, servers and end-user systems for a demo ministry. Coordinate vendor support, manage backups and prepare monthly IT status reports. Sample posting for UI demonstration only." },
  { src: "gov", slug: "assistant-programmer-bureau", title: "Assistant Programmer", org: "Demo National Data Bureau", sector: "Government", category: "Software", location: "Dhaka", salary: "Tk 22,000 - 53,060 (Grade 11)", experience: "0-2 years", skills: ["Java", "SQL", "Spring Boot", "Git"], deadline: "2026-11-30", verified: true, created: "2026-10-09", desc: "Develop and maintain internal citizen-service applications under senior programmers. Write SQL reports and fix defects from user feedback." },
  { src: "gov", slug: "system-engineer-ict-division", title: "System Engineer", org: "Demo ICT Infrastructure Division", sector: "Government", category: "IT & Systems", location: "Gazipur", salary: "Tk 43,000 - 69,850 (Grade 7)", experience: "4+ years", skills: ["Windows Server", "Linux", "VMware", "Active Directory"], deadline: null, verified: false, created: "2026-09-21", desc: "Administer virtualised data-centre workloads, apply patches and monitor availability for a demo government data centre." },
  { src: "gov", slug: "data-analyst-statistics", title: "Data Analyst", org: "Demo Bureau of Statistics Sample", sector: "Government", category: "Data", location: "Dhaka", salary: "Tk 35,500 - 67,010", experience: "2-4 years", skills: ["Python", "SQL", "Excel", "Power BI"], deadline: "2027-01-15", verified: true, created: "2026-10-18", desc: "Clean survey datasets, build dashboards and publish quarterly indicator summaries. Strong statistics background preferred." },
  { src: "gov", slug: "software-engineer-egov", title: "Software Engineer", org: "Demo e-Governance Programme", sector: "Government", category: "Software", location: "Rajshahi", salary: "Tk 50,000 - 70,000", experience: "3+ years", skills: ["PHP", "Laravel", "MySQL", "REST APIs"], deadline: "2026-12-05", verified: false, created: "2026-10-25", desc: "Build and extend e-service portals for divisional offices. Work with a small team on requirements, delivery and support." },
  // Private (10)
  { src: "pvt", slug: "backend-developer-nodecraft", title: "Backend Developer", org: "Demo NodeCraft Ltd", sector: "Private", category: "Software", location: "Dhaka", salary: "Tk 70,000 - 110,000", experience: "3+ years", skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker"], deadline: "2026-12-15", verified: true, created: "2026-10-28", desc: "Design REST APIs and background workers for a demo SaaS product. Own features from design to production with code review and automated tests." },
  { src: "pvt", slug: "frontend-developer-pixelhive", title: "Frontend Developer", org: "Demo PixelHive Studio", sector: "Private", category: "Software", location: "Dhaka", salary: "Tk 55,000 - 90,000", experience: "2+ years", skills: ["React", "Next.js", "TypeScript", "Tailwind CSS"], deadline: "2026-12-10", verified: true, created: "2026-10-30", desc: "Build accessible, responsive interfaces for client web apps. Collaborate with designers and backend developers on component libraries." },
  { src: "pvt", slug: "fullstack-developer-cloudlane", title: "Full Stack Developer", org: "Demo CloudLane Technologies", sector: "Private", category: "Software", location: "Remote", salary: "Tk 80,000 - 130,000", experience: "3-5 years", skills: ["React", "Node.js", "PostgreSQL", "AWS"], deadline: null, verified: true, created: "2026-10-12", desc: "Remote-first role delivering features across the stack for an international demo client. Overlap with European time zone required." },
  { src: "pvt", slug: "qa-engineer-testbridge", title: "QA Engineer", org: "Demo TestBridge Solutions", sector: "Private", category: "QA", location: "Chattogram", salary: "Tk 40,000 - 65,000", experience: "2+ years", skills: ["Selenium", "Playwright", "API Testing", "Jira"], deadline: "2026-11-25", verified: false, created: "2026-10-05", desc: "Plan and automate regression suites for web products. Report defects clearly and help improve release quality." },
  { src: "pvt", slug: "devops-engineer-opsforge", title: "DevOps Engineer", org: "Demo OpsForge Ltd", sector: "Private", category: "DevOps", location: "Dhaka", salary: "Tk 90,000 - 140,000", experience: "4+ years", skills: ["Kubernetes", "Terraform", "CI/CD", "Linux", "Prometheus"], deadline: "2027-01-10", verified: true, created: "2026-10-20", desc: "Run reliable CI/CD pipelines and cluster infrastructure for a demo platform team. On-call rotation included." },
  { src: "pvt", slug: "software-engineer-appnest", title: "Software Engineer", org: "Demo AppNest Software", sector: "Private", category: "Software", location: "Gazipur", salary: "Tk 60,000 - 95,000", experience: "2-4 years", skills: ["Java", "Spring Boot", "Microservices", "Kafka"], deadline: "2026-12-28", verified: true, created: "2026-09-30", desc: "Develop microservices for a demo logistics platform. Participate in design reviews and production support." },
  { src: "pvt", slug: "data-analyst-insightly", title: "Data Analyst", org: "Demo Insightly Analytics", sector: "Private", category: "Data", location: "Remote", salary: "Tk 50,000 - 85,000", experience: "1-3 years", skills: ["SQL", "Python", "Tableau", "dbt"], deadline: "2026-12-12", verified: false, created: "2026-10-15", desc: "Turn product usage data into weekly insights. Build dashboards and support experiments with stakeholders." },
  { src: "pvt", slug: "assistant-programmer-bytenest", title: "Assistant Programmer", org: "Demo ByteNest Technologies", sector: "Private", category: "Software", location: "Chattogram", salary: "Tk 25,000 - 40,000", experience: "0-1 years", skills: ["JavaScript", "HTML", "CSS", "Git"], deadline: null, verified: false, created: "2026-09-15", desc: "Entry-level role supporting senior developers on web projects. Mentoring and on-the-job training provided." },
  { src: "pvt", slug: "backend-developer-pyroute", title: "Backend Developer", org: "Demo PyRoute Systems", sector: "Private", category: "Software", location: "Remote", salary: "Tk 75,000 - 120,000", experience: "3+ years", skills: ["Python", "Django", "Redis", "PostgreSQL"], deadline: "2026-11-20", verified: true, created: "2026-10-08", desc: "Build and scale Django services for a demo ride-hailing backend. Strong database tuning skills valued." },
  { src: "pvt", slug: "it-officer-retailmart", title: "IT Officer", org: "Demo RetailMart Group", sector: "Private", category: "IT & Systems", location: "Rajshahi", salary: "Tk 30,000 - 45,000", experience: "1-3 years", skills: ["Helpdesk", "Networking", "POS Systems", "Windows"], deadline: "2026-12-01", verified: false, created: "2026-10-22", desc: "Support store systems, POS terminals and branch networks across a demo retail chain." },
  // Banking / Fintech (5)
  { src: "bank", slug: "backend-developer-paywave", title: "Backend Developer", org: "Demo PayWave Fintech", sector: "Banking", category: "Software", location: "Dhaka", salary: "Tk 85,000 - 135,000", experience: "3+ years", skills: ["Java", "Spring Boot", "PostgreSQL", "Payments"], deadline: "2026-12-18", verified: true, created: "2026-10-27", desc: "Build wallet and transfer services for a demo mobile financial service. Focus on correctness, idempotency and auditability." },
  { src: "bank", slug: "it-officer-demo-bank", title: "IT Officer", org: "Demo Sample Bank Ltd", sector: "Banking", category: "IT & Systems", location: "Chattogram", salary: "Tk 45,000 - 70,000", experience: "2+ years", skills: ["Core Banking", "Networking", "Oracle", "ATM Support"], deadline: "2026-11-28", verified: true, created: "2026-10-03", desc: "Support branch and ATM infrastructure for a demo bank. Handle incident tickets and routine maintenance windows." },
  { src: "bank", slug: "qa-engineer-finedge", title: "QA Engineer", org: "Demo FinEdge Digital", sector: "Banking", category: "QA", location: "Dhaka", salary: "Tk 55,000 - 90,000", experience: "3+ years", skills: ["Test Automation", "Postman", "SQL", "Security Testing"], deadline: null, verified: false, created: "2026-10-14", desc: "Validate payment flows end to end, including negative and reconciliation scenarios, for a demo digital bank." },
  { src: "bank", slug: "data-analyst-credit-insight", title: "Data Analyst", org: "Demo Credit Insight Bank", sector: "Banking", category: "Data", location: "Dhaka", salary: "Tk 60,000 - 100,000", experience: "2-4 years", skills: ["SQL", "Python", "Risk Analytics", "Power BI"], deadline: "2027-01-05", verified: true, created: "2026-10-24", desc: "Analyse portfolio risk and customer behaviour, and produce regulatory and management reports for a demo bank." },
  { src: "bank", slug: "devops-engineer-secure-pay", title: "DevOps Engineer", org: "Demo SecurePay Services", sector: "Banking", category: "DevOps", location: "Gazipur", salary: "Tk 95,000 - 150,000", experience: "4+ years", skills: ["AWS", "Ansible", "Jenkins", "Security Hardening"], deadline: "2026-12-22", verified: true, created: "2026-10-29", desc: "Automate hardened deployments and monitoring for a demo payment processor operating under strict compliance." },
  // University (3)
  { src: "uni", slug: "system-engineer-demo-university", title: "System Engineer", org: "Demo Sample University", sector: "University", category: "IT & Systems", location: "Rajshahi", salary: "Tk 40,000 - 62,000", experience: "3+ years", skills: ["Linux", "Moodle", "Networking", "Virtualisation"], deadline: "2026-12-08", verified: true, created: "2026-10-06", desc: "Operate campus servers, the learning management system and Wi-Fi infrastructure for a demo university." },
  { src: "uni", slug: "fullstack-developer-research-lab", title: "Full Stack Developer", org: "Demo University Research Lab", sector: "University", category: "Software", location: "Dhaka", salary: "Tk 50,000 - 75,000", experience: "2+ years", skills: ["Python", "React", "FastAPI", "PostgreSQL"], deadline: null, verified: false, created: "2026-09-25", desc: "Build web tools for research data collection and visualisation. Flexible hours and academic collaboration." },
  { src: "uni", slug: "assistant-programmer-demo-institute", title: "Assistant Programmer", org: "Demo Institute of Technology", sector: "University", category: "Software", location: "Chattogram", salary: "Tk 28,000 - 42,000", experience: "0-2 years", skills: ["C#", ".NET", "SQL Server", "Git"], deadline: "2026-12-14", verified: true, created: "2026-10-16", desc: "Maintain student information and admissions systems for a demo institute, supporting the registrar office." },
  // NGO (2)
  { src: "ngo", slug: "data-analyst-demo-relief", title: "Data Analyst", org: "Demo Relief Foundation", sector: "NGO", category: "Data", location: "Dhaka", salary: "Tk 48,000 - 72,000", experience: "2-4 years", skills: ["KoboToolbox", "Excel", "SQL", "Power BI"], deadline: "2026-12-02", verified: true, created: "2026-10-11", desc: "Manage field survey data pipelines and produce programme impact dashboards for a demo humanitarian organisation." },
  { src: "ngo", slug: "fullstack-developer-demo-health", title: "Full Stack Developer", org: "Demo Community Health Trust", sector: "NGO", category: "Software", location: "Remote", salary: "Tk 65,000 - 100,000", experience: "3+ years", skills: ["React", "Node.js", "PostgreSQL", "DHIS2"], deadline: null, verified: false, created: "2026-10-01", desc: "Build offline-friendly health reporting tools for community clinics in a demo programme." },
];

// ---- Structured salary (DEMONSTRATION DATA ONLY) -------------------------------------
// None of these figures are verified employer information.
// - BDT ranges are copied from the existing `salary` text of the same job. Government
//   "Grade N" numbers are pay-scale labels and are NOT amounts; they are ignored here.
// - USD/EUR, HOURLY, YEARLY, NEGOTIABLE and NOT_DISCLOSED rows are SYNTHETIC examples so the
//   API can show every shape. Where the structured value would contradict the old text, the
//   legacy `salary` text is overridden below so the two never disagree.
// - Slugs absent from the map are left as legacy rows: all structured columns stay NULL.
const bdt = (min: number, max: number): SalaryInput => ({
  salaryMin: min, salaryMax: max, salaryCurrency: "BDT", salaryPeriod: "MONTHLY", salaryDisclosure: "DISCLOSED",
});
const disclosed = (
  salaryCurrency: string, salaryPeriod: "MONTHLY" | "YEARLY" | "HOURLY", salaryMin: number, salaryMax: number,
): SalaryInput => ({ salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryDisclosure: "DISCLOSED" });
const NEGOTIABLE: SalaryInput = { salaryDisclosure: "NEGOTIABLE" };
const NOT_DISCLOSED: SalaryInput = { salaryDisclosure: "NOT_DISCLOSED" };

const SALARIES: Record<string, { text?: string; sal: SalaryInput }> = {
  // BDT monthly, from existing text
  "it-officer-ministry": { sal: bdt(35500, 67010) },
  "assistant-programmer-bureau": { sal: bdt(22000, 53060) },
  "system-engineer-ict-division": { sal: bdt(43000, 69850) },
  "data-analyst-statistics": { sal: bdt(35500, 67010) },
  "software-engineer-egov": { sal: bdt(50000, 70000) },
  "backend-developer-nodecraft": { sal: bdt(70000, 110000) },
  "frontend-developer-pixelhive": { sal: bdt(55000, 90000) },
  "backend-developer-paywave": { sal: bdt(85000, 135000) },
  "data-analyst-credit-insight": { sal: bdt(60000, 100000) },
  "devops-engineer-secure-pay": { sal: bdt(95000, 150000) },
  "system-engineer-demo-university": { sal: bdt(40000, 62000) },
  "assistant-programmer-demo-institute": { sal: bdt(28000, 42000) },
  "data-analyst-demo-relief": { sal: bdt(48000, 72000) },
  // Synthetic foreign-currency examples (remote roles); text overridden to match
  "fullstack-developer-cloudlane": { text: "EUR 28,000 - 42,000 / year (demo)", sal: disclosed("EUR", "YEARLY", 28000, 42000) },
  "backend-developer-pyroute": { text: "USD 2,000 - 3,200 / month (demo)", sal: disclosed("USD", "MONTHLY", 2000, 3200) },
  "data-analyst-insightly": { text: "USD 15 - 25 / hour (demo)", sal: disclosed("USD", "HOURLY", 15, 25) },
  "fullstack-developer-demo-health": { text: "USD 1,800 - 2,800 / month (demo)", sal: disclosed("USD", "MONTHLY", 1800, 2800) },
  // Synthetic negotiable / undisclosed examples; text overridden to match
  "qa-engineer-testbridge": { text: "Negotiable", sal: NEGOTIABLE },
  "it-officer-retailmart": { text: "Negotiable", sal: NEGOTIABLE },
  "fullstack-developer-research-lab": { text: "Negotiable", sal: NEGOTIABLE },
  "assistant-programmer-bytenest": { text: "", sal: NOT_DISCLOSED },
  "qa-engineer-finedge": { text: "", sal: NOT_DISCLOSED },
  // Left as legacy rows (structured columns NULL): devops-engineer-opsforge,
  // it-officer-demo-bank, software-engineer-appnest.
};
for (const [slug, { sal }] of Object.entries(SALARIES)) {
  const r = salarySchema.safeParse(sal);
  if (!r.success) throw new Error(`Seed salary invalid for ${slug}: ${r.error.message}`);
}

const jobUrl = (j: JobSeed) => `https://demo-jobs.example.com/${j.sector.toLowerCase()}/${j.slug}`;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production");

  const ids = new Map<string, number>();
  let sc = 0, su = 0;
  for (const s of SOURCES) {
    const data = { name: s.name, type: s.type, url: s.url };
    const found = await prisma.jobSource.findFirst({ where: { url: s.url } });
    if (found) {
      await prisma.jobSource.update({ where: { id: found.id }, data });
      ids.set(s.key, found.id);
      su++;
    } else {
      ids.set(s.key, (await prisma.jobSource.create({ data })).id);
      sc++;
    }
  }

  let jc = 0, ju = 0;
  for (const j of JOBS) {
    const sourceUrl = jobUrl(j);
    const entry = SALARIES[j.slug];
    const sal = entry?.sal ?? {};
    const data = {
      title: j.title, organization: j.org, sector: j.sector, category: j.category, location: j.location,
      description: j.desc, salary: entry?.text ?? j.salary, experience: j.experience, skills: j.skills,
      deadline: j.deadline ? new Date(`${j.deadline}T00:00:00Z`) : null,
      // Explicit nulls so a re-run resets legacy rows instead of keeping stale values.
      salaryMin: sal.salaryMin ?? null, salaryMax: sal.salaryMax ?? null, salaryCurrency: sal.salaryCurrency ?? null,
      salaryPeriod: sal.salaryPeriod ?? null, salaryDisclosure: sal.salaryDisclosure ?? null,
      sourceId: ids.get(j.src)!, sourceUrl, verified: j.verified, createdAt: new Date(`${j.created}T08:00:00Z`),
    };
    const found = await prisma.job.findFirst({ where: { sourceUrl } });
    if (found) {
      await prisma.job.update({ where: { id: found.id }, data });
      ju++;
    } else {
      await prisma.job.create({ data });
      jc++;
    }
  }
  console.log(`sources: created ${sc}, updated ${su} | jobs: created ${jc}, updated ${ju}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
