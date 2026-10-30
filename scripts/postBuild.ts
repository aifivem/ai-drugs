import { existsSync } from "node:fs";
import { cp, readFile, writeFile, access } from "node:fs/promises";
import fg from "fast-glob";
import { dirname, extname } from "node:path";
import type Package from "../package.json";
import { waitFor } from "@overextended/core/utils";

/** `github:owner/repo`, `git+https://github.com/owner/repo.git` or `{ url }` -> `https://github.com/owner/repo`. */
function repositoryUrl(
  value: string | { url?: string } | undefined,
): string | undefined {
  const raw = typeof value === "string" ? value : value?.url;
  const match = raw?.match(
    /^(?:github:|(?:git\+)?https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
  );
  return match ? `https://github.com/${match[1]}` : undefined;
}

function reduceArray(name: string, files?: string[]): string {
  return files?.[0]
    ? `\n${name} {${files.reduce((acc, value) => {
        return value ? `${acc}\n\t'${value}',` : acc;
      }, "")}\n}\n`
    : "";
}

async function generateDirectoryGlobs(root: string, useRoot = false) {
  const files = await fg("**/*", {
    cwd: root,
    onlyFiles: true,
  });

  const groups = new Map<string, Set<string>>();

  for (const file of files) {
    const dir = dirname(file);

    let ext = extname(file);

    if (ext === ".") {
      ext = "";
    }

    let exts = groups.get(dir);

    if (!exts) {
      exts = new Set();
      groups.set(dir, exts);
    }

    exts.add(ext);
  }

  const path = useRoot ? root : "dist";

  return [...groups.entries()].flatMap(([dir, exts]) => {
    const prefix = dir === "." ? `${path}/` : `${path}/${dir}/`;

    return [...exts].map((ext) => {
      return ext ? `${prefix}*${ext}` : `${prefix}*`;
    });
  });
}

/** `client_script 'dist/client.js'`, or a `client_scripts` block when extra scripts follow the bundle. */
function scripts(
  side: "client" | "server",
  bundle: boolean,
  extra?: string[],
): string {
  const list = [...(bundle ? [`dist/${side}.js`] : []), ...(extra ?? [])];
  if (list.length === 0) return "";
  if (list.length === 1)
    return `${side}_script '${list[0]}'
`;
  return `${side}_scripts {${list
    .map(
      (file) => `
	'${file}',`,
    )
    .join("")}
}
`;
}

let buildCount = 0;
let fxmanifest = "";

export default async function () {
  // Runs after the last bundle: one per side that has resource/<side>/index.ts.
  const hasClient = existsSync("./resource/client/index.ts");
  const hasServer = existsSync("./resource/server/index.ts");
  if (++buildCount < Number(hasClient) + Number(hasServer)) return;

  const {
    name,
    author,
    version,
    license,
    description,
    fxDependencies,
    fxProvide,
    fxFiles,
    fxVersion,
    fxClientScripts,
    fxServerScripts,
    repository,
  }: typeof Package & {
    /** GitHub repository (`github:owner/repo`, a url or `{ url }`): written as `repository`, ai-core checks its releases. */
    repository?: string | { url?: string };
    fxDependencies?: string[];
    /** Manifest version when it must differ from the package version (a stand-in reporting the version it mirrors). */
    fxVersion?: string;
    /** Resource names this one stands in for (`provide`), e.g. a compatibility resource. */
    fxProvide?: string[];
    /** Extra files outside public/ that clients may download or other resources include (`@name/path`). */
    fxFiles?: string[];
    /** Extra scripts loaded after the bundle on each side (ai-core's Lua bridge). */
    fxClientScripts?: string[];
    fxServerScripts?: string[];
  } = JSON.parse(await readFile("./package.json", "utf8"));

  // public/ is optional: static files players may download, copied to dist/.
  const hasPublic = existsSync("./public");
  const files = hasPublic ? await generateDirectoryGlobs("public") : [];
  let web;

  try {
    await access("./web");

    web = await waitFor(
      async () => {
        const web = await generateDirectoryGlobs("dist/web", true);

        return web.length ? web : null;
      },
      { interval: 500, timeout: 1200000 },
    );
  } catch {}

  if (web) files.push(...web);

  files.unshift("locales/*.json");
  if (fxFiles) files.push(...fxFiles);

  let body = Object.entries({
    name,
    author: author.name,
    version: fxVersion ?? version,
    license,
    description,
    repository: repositoryUrl(repository),
  }).reduce(
    (acc, [key, value]) => (value ? `${acc}${key} '${value}'\n` : acc),
    "",
  );

  body += `fx_version 'cerulean'
game 'gta5'
node_version '22'

${scripts("client", hasClient, fxClientScripts)}${scripts("server", hasServer, fxServerScripts)}${web ? `ui_page 'dist/web/index.html'` : ``}
${reduceArray("dependencies", fxDependencies)}${reduceArray("files", files)}${(
    fxProvide ?? []
  )
    .map(
      (n) => `provide '${n}'
`,
    )
    .join("")}`;

  if (body === fxmanifest) return;

  console.log(`Generated new fxmanifest.lua`);
  fxmanifest = body;

  if (hasPublic) await cp("./public", "./dist", { recursive: true });

  await writeFile("./fxmanifest.lua", body);
  await writeFile(".yarn.installed", new Date().toISOString());
}
