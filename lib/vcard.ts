import type { ContactKind, ProfileView } from "./view";

/**
 * A vCard 3.0 (RFC 2426) for the profile, so a recruiter can put the
 * candidate in their address book in one tap instead of copying five fields.
 *
 * It is built only from what the profile view already carries, which means
 * from content/profile.yaml and CONTACT_PHONE: a field the page does not
 * show never appears in the file either.
 */

/** RFC 2426 §4: backslashes, newlines, commas and semicolons in text values are escaped. */
function text(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

const encoder = new TextEncoder();

/**
 * RFC 2425 §5.8.1: a line longer than 75 octets is folded onto continuation
 * lines that start with a space. Counted in UTF-8 bytes and cut on code point
 * boundaries, so a name with accents is never split inside a character.
 */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines spend one octet on their leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * N is required in 3.0, and address books sort and display by it rather than
 * by FN. The last word is taken as the family name and the rest as given
 * names, which says no more about the name than the page already does.
 */
function structuredName(name: string): string {
  const words = name.trim().split(/\s+/);
  const family = words.length > 1 ? (words.pop() ?? "") : "";
  return [text(family), text(words.join(" ")), "", "", ""].join(";");
}

export function buildVCard(profile: ProfileView): string {
  const contact = (kind: ContactKind) => profile.contacts.find((entry) => entry.kind === kind);
  const email = contact("email");
  const phone = contact("phone");
  const portfolio = contact("portfolio");

  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${structuredName(profile.name)}`, `FN:${text(profile.name)}`];

  if (email !== undefined) {
    lines.push(`EMAIL;TYPE=INTERNET:${text(email.copy ?? email.href.replace(/^mailto:/, ""))}`);
  }
  if (phone !== undefined) {
    // Digits and a leading "+" only (E.164), and typed as a mobile: the form
    // address books import most reliably. The display copy keeps its spaces.
    const digits = phone.href.replace(/^tel:/, "").replace(/[^\d+]/g, "");
    lines.push(`TEL;TYPE=CELL,VOICE:${digits}`);
  }
  if (portfolio !== undefined) lines.push(`URL:${portfolio.href}`);

  // Further links share the URL property, so each is grouped with a label;
  // X-ABLabel is the extension Apple and Google Contacts read for that, and
  // clients that do not know it still keep the URL.
  let item = 0;
  for (const kind of ["linkedin", "github"] as const) {
    const link = contact(kind);
    if (link === undefined) continue;
    item += 1;
    lines.push(`item${String(item)}.URL:${link.href}`, `item${String(item)}.X-ABLabel:${text(link.label)}`);
  }

  lines.push("END:VCARD");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** "Shubham Kumar Singh" to "Shubham-Kumar-Singh.vcf". */
export function vCardFilename(profile: ProfileView): string {
  const stem = profile.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${stem === "" ? "contact" : stem}.vcf`;
}
