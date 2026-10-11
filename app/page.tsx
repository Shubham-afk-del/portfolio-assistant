import { Assistant } from "@/components/chat/Assistant";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ProfilePanel } from "@/components/profile/ProfilePanel";
import { Backdrop } from "@/components/shell/Backdrop";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Cursor } from "@/components/shell/Cursor";
import { PanelGlow } from "@/components/shell/PanelGlow";
import { ParticleField } from "@/components/shell/ParticleField";
import { buildCorpusMap } from "@/lib/corpus-map";
import { getProfile } from "@/lib/profile";
import { loadIndex } from "@/lib/retrieval/index-store";
import { vars } from "@/lib/utils";
import { buildProfileView } from "@/lib/view";

/**
 * One page: who this is about, and the assistant.
 *
 * On wide screens the profile is a sidebar beside the console; below that it
 * moves into a sheet opened from the console header, and the welcome screen
 * carries the essentials. The phone number comes from the environment, not
 * the profile, so it stays out of the repository (see content/profile.yaml).
 *
 * Each panel's frosted glass is its own layer behind the content rather than
 * a style on the panel; app/globals.css (.glass-fill) explains why.
 *
 * The knowledge map is computed here, at build time, from the committed
 * index: a PCA of every chunk's embedding (lib/corpus-map.ts). The page is
 * static, so that runs once per build, and the browser receives only ids
 * and coordinates, never an embedding.
 */
export default function Page() {
  const profile = buildProfileView(getProfile(), process.env["CONTACT_PHONE"]);
  const corpus = buildCorpusMap(loadIndex());

  return (
    <ChatProvider>
      <CommandPalette profile={profile}>
        <Backdrop />
        <Cursor />

        <div className="mx-auto flex h-[100dvh] max-w-[92rem] gap-5 sm:p-4 lg:p-5 xl:gap-6 xl:p-6">
          <aside
            aria-label={`About ${profile.name}`}
            className="glass-panel enter-panel hidden w-[22rem] shrink-0 overflow-hidden rounded-[1.75rem] lg:block xl:w-[23.5rem]"
          >
            <div aria-hidden className="glass-fill" />
            <div className="panel-content scroll-thin relative z-[1] h-full overflow-y-auto">
              <ProfilePanel profile={profile} />
            </div>
          </aside>

          <main
            className="glass-panel enter-panel min-w-0 flex-1 overflow-hidden sm:rounded-[1.75rem]"
            style={vars({ "--delay": "90ms" })}
          >
            <div aria-hidden className="glass-fill max-sm:border-0" />
            <PanelGlow />
            <ParticleField />
            <div className="panel-content absolute inset-0 z-[1]">
              <h1 className="sr-only">Ask about {profile.name}: an AI assistant</h1>
              <Assistant profile={profile} corpus={corpus} />
            </div>
          </main>
        </div>
      </CommandPalette>
    </ChatProvider>
  );
}
