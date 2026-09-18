import { profile, outstanding } from "@/lib/profile";

/**
 * Scaffold placeholder. The hero built to DESIGN-TOKENS.md lands in step 3 —
 * this exists so `npm run build` has a route to compile and so the profile
 * loader is proven end to end. Deliberately plain; nothing here is final.
 */
export default function Page() {
  return (
    <main className="mx-auto max-w-[68ch] px-6 py-16">
      <h1 className="font-prose text-headline">{profile.name}</h1>
      <p className="mt-2 text-ui text-ink-muted">
        {profile.location}
      </p>
      <p className="mt-8 text-ui">
        Profile loaded and validated. {outstanding.length} field
        {outstanding.length === 1 ? "" : "s"} still marked{" "}
        <code className="text-caution">TODO(owner)</code>; they are omitted from the
        UI rather than filled with placeholder text.
      </p>
    </main>
  );
}
