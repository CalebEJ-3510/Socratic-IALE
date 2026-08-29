/**
 * Static-deploy finalizer.
 *
 * SPA mode prerenders the app shell to dist/client/_shell.html. Static hosts
 * look for index.html (and 404.html as their built-in fallback), so publish the
 * same shell under both names. Combined with the SPA redirect in netlify.toml,
 * any deep link resolves to the shell and TanStack Router takes over on the
 * client — no server runtime involved.
 */
import { copyFile, access } from "node:fs/promises";
import { join } from "node:path";

const dir = join(process.cwd(), "dist", "client");
const shell = join(dir, "_shell.html");

await access(shell);
for (const name of ["index.html", "404.html"]) {
  await copyFile(shell, join(dir, name));
  console.log(`[static] wrote dist/client/${name}`);
}
