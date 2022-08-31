import { esbuildPlugin } from "@web/dev-server-esbuild";

export default {
  files: ["src/**/*.unit.ts"],
  plugins: [esbuildPlugin({ ts: true })],
  nodeResolve: true,
  coverage: true,
  coverageConfig: {
    reportDir: ".svelte-kit/coverage",
  },
  testRunnerHtml: testFramework =>
    `<html>
      <body>
        <script>window.process = { env: { NODE_ENV: "development" } }</script>
        <script type="module" src="${testFramework}"></script>
      </body>
    </html>`,
};
