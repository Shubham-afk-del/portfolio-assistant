import next from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      /**
       * Vendored from registries: components/ui from shadcn/ui and
       * components/ai-elements from Vercel's AI Elements. They live in the repo
       * so they can be restyled, but they are upstream's code and are re-synced
       * by re-running the registry CLI. Linting them means hand-patching React
       * Compiler findings that upstream will overwrite on the next update, and
       * then losing the patches. Everything written for this project is linted.
       */
      "components/ui/**",
      "components/ai-elements/**",
    ],
  },
  ...next,
];

export default config;
