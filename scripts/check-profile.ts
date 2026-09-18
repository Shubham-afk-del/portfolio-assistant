/**
 * Prints the outstanding TODO(owner) paths in content/profile.yaml.
 *
 * Runs as `prebuild` and `predev`. It exits 0 even when fields are outstanding,
 * PHASE-0.md §2 is explicit that the build surfaces them and never fails on them,
 * because a failing build pressures us into inventing content. It DOES exit 1 if
 * the profile fails schema validation, which is a genuine error.
 */
import { getProfile, outstanding, uncalibrated } from "../lib/profile";

const profile = getProfile();
const outstandingPaths = outstanding();
const uncalibratedSkills = uncalibrated();
const total = outstandingPaths.length;

console.log(`\nprofile.yaml, ${profile.name}`);

if (total === 0) {
  console.log("  no outstanding TODO(owner) fields\n");
} else {
  console.log(`  ${total} outstanding TODO(owner) field${total === 1 ? "" : "s"}:`);
  for (const path of outstandingPaths) console.log(`    ${path}`);
  if (uncalibratedSkills.length > 0) {
    console.log(`  skills with no level set: ${uncalibratedSkills.join(", ")}`);
  }
  console.log("  these are omitted from the UI, never filled with placeholder text\n");
}
