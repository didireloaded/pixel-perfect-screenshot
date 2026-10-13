import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = (value) => path.join(root, value);
if (!readFileSync(file("worker-ui/dist/index.html"), "utf8").includes("/worker/assets/")) {
  throw new Error("Build worker-ui with npm run build -- --base=/worker/ before assembling Sites.");
}
// The manager build lives in .output; dist is the ignored Sites artifact only.
rmSync(file("dist"), { recursive: true, force: true });
mkdirSync(file("dist/server"), { recursive: true });
cpSync(file(".output/server"), file("dist/server/nitro"), { recursive: true });
cpSync(file("hosting/sites/worker.js"), file("dist/server/index.js"));
cpSync(file(".output/public"), file("dist/client"), { recursive: true });
cpSync(file("worker-ui/dist"), file("dist/client/worker"), { recursive: true });
appendFileSync(
  file("dist/client/_headers"),
  "\n/worker/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/worker/\n  Cache-Control: no-store\n",
);
mkdirSync(file("dist/.openai"), { recursive: true });
cpSync(file(".openai/hosting.json"), file("dist/.openai/hosting.json"));
console.log("Sites artifact assembled in dist/");
