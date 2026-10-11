import type { Profile } from "./schema";
import { filled, filledList } from "./profile";
import { publicFileSize } from "./asset";

/**
 * The profile, shaped for the interface.
 *
 * Client components cannot read content/profile.yaml, and should not be handed
 * all of it either: the scripted answers and the do-not-discuss list are for
 * the model, not the page. This picks out what the page shows, formats it once
 * on the server, and drops every field still marked TODO(owner) rather than
 * passing a placeholder through.
 */

export type ContactKind = "portfolio" | "linkedin" | "github" | "email" | "phone";

export interface ContactLink {
  kind: ContactKind;
  label: string;
  /** What the row shows, shorter than the href where the href is noisy. */
  display: string;
  href: string;
  /** Set for values a recruiter is more likely to copy than follow. */
  copy?: string;
  external: boolean;
}

export interface TimelineEntry {
  id: string;
  title: string;
  org: string;
  period: string;
  location?: string;
  tags: string[];
  current: boolean;
  /** The question the entry's "ask" button sends to the assistant. */
  question: string;
}

export interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
  /** Its public verification page, when there is one. */
  url?: string;
}

export interface ProfileView {
  name: string;
  firstName: string;
  headline?: string;
  location: string;
  availability?: string;
  study?: { credential: string; school: string };
  contacts: ContactLink[];
  resume: { href: string; size: string; filename: string };
  experience: TimelineEntry[];
  education: TimelineEntry[];
  /** The roles he is looking for, from profile.yaml's target_roles. */
  targetRoles: string[];
  certifications: CertificationEntry[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2023-06" to "Jun 2023". Bare years and "present" pass through. */
function formatDate(value: string | number): string {
  if (typeof value === "number") return String(value);
  if (value === "present") return "Present";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  const year = match?.[1];
  const month = MONTHS[Number(match?.[2]) - 1];
  if (year === undefined) return value;
  return month === undefined ? year : `${month} ${year}`;
}

function period(start: string | number, end: string | number): string {
  // A start still marked TODO(owner) is left out rather than shown, like
  // every other unfilled field: a current role then reads "Current".
  if (typeof start === "string" && filled(start) === undefined) {
    return end === "present" ? "Current" : formatDate(end);
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** The URL without its scheme, "www." or trailing slash. */
function bare(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function contactsFor(profile: Profile, phone: string | undefined): ContactLink[] {
  const { portfolio, linkedin, github, email } = profile.contact;
  const links: ContactLink[] = [];

  if (portfolio !== undefined) {
    links.push({
      kind: "portfolio",
      label: "Portfolio",
      display: bare(portfolio),
      href: portfolio,
      external: true,
    });
  }
  if (linkedin !== undefined) {
    links.push({
      kind: "linkedin",
      label: "LinkedIn",
      display: bare(linkedin).replace(/^linkedin\.com\//, ""),
      href: linkedin,
      external: true,
    });
  }
  if (github !== undefined) {
    links.push({
      kind: "github",
      label: "GitHub",
      display: bare(github).replace(/^github\.com\//, ""),
      href: github,
      external: true,
    });
  }
  links.push({
    kind: "email",
    label: "Email",
    display: email,
    href: `mailto:${email}`,
    copy: email,
    external: false,
  });

  const number = phone?.trim();
  if (number !== undefined && number !== "") {
    links.push({
      kind: "phone",
      label: "Phone",
      display: number,
      href: `tel:${number.replace(/[^\d+]/g, "")}`,
      copy: number,
      external: false,
    });
  }

  return links;
}

export function buildProfileView(profile: Profile, phone: string | undefined): ProfileView {
  const studying = profile.education.find((entry) => filled(entry.status) === "in progress");

  return {
    name: profile.name,
    firstName: profile.preferred_name,
    headline: filled(profile.headline),
    location: profile.location,
    availability: filled(profile.availability.status),
    study:
      studying === undefined
        ? undefined
        : { credential: studying.credential, school: studying.school },
    contacts: contactsFor(profile, phone),
    resume: {
      href: "/resume.pdf",
      size: publicFileSize("resume.pdf"),
      filename: "Shubham-Kumar-Singh-CV.pdf",
    },
    targetRoles: filledList(profile.target_roles) ?? [],
    certifications: profile.certifications.map((item, index) => ({
      id: `certification-${String(index)}`,
      name: item.name,
      issuer: item.issuer,
      date: formatDate(item.date),
      url: item.url,
    })),
    experience: profile.experience.map((role, index) => ({
      id: `experience-${String(index)}`,
      title: role.role,
      org: role.company,
      period: period(role.start, role.end),
      location: role.location,
      tags: role.stack,
      current: role.end === "present",
      question: `What did he do as ${role.role} at ${role.company}?`,
    })),
    education: profile.education.map((entry, index) => {
      const current = filled(entry.status) === "in progress";
      return {
        id: `education-${String(index)}`,
        title: entry.credential,
        org: entry.school,
        period: period(entry.start, entry.end),
        tags: [],
        current,
        question: current
          ? `What is he studying at ${entry.school}?`
          : `What did he study at ${entry.school}?`,
      };
    }),
  };
}
