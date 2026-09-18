import { ImageResponse } from "next/og";
import { getProfile, filled } from "@/lib/profile";

export const alt = "Shubham Kumar Singh, MSc AI candidate";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated at build time from the profile, so the card a recruiter sees in
 * Slack or LinkedIn cannot drift from the page. Per-conversation OG images
 * keyed to the first question are Phase 7 (SPEC-v2 §13); this is the static
 * one for the home route.
 *
 * Colours are the light-mode tokens from app/globals.css. They are literals
 * here because ImageResponse renders outside the document, so there are no CSS
 * custom properties to read.
 */
export default function OpengraphImage() {
  const profile = getProfile();
  const headline = filled(profile.headline);
  const availability = filled(profile.availability.status);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#F5F6F8",
          color: "#14171C",
          padding: "72px 80px",
        }}
      >
        <div style={{ width: 6, backgroundColor: "#1F3D7A", marginRight: 48 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 34, letterSpacing: -0.5 }}>{profile.name}</div>
          {headline !== undefined && (
            <div style={{ fontSize: 52, lineHeight: 1.22, marginTop: 28, maxWidth: 880 }}>
              {headline}
            </div>
          )}
          <div style={{ marginTop: "auto", display: "flex", gap: 32, fontSize: 26, color: "#55606E" }}>
            <span>{profile.location}</span>
            {availability !== undefined && <span>{availability}</span>}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
