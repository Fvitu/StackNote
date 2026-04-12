import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const oauth4webapiFile = path.resolve(scriptDir, '../node_modules/oauth4webapi/build/index.js');
const mswInterceptorsFile = path.resolve(scriptDir, '../node_modules/@mswjs/interceptors/lib/node/ClientRequest-2rDe54Ui.cjs');

const original = `const URLParse = URL.parse\n    ?\n        (url, base) => URL.parse(url, base)\n    : (url, base) => {\n        try {\n            return new URL(url, base);\n        }\n        catch {\n            return null;\n        }\n    };`;

const replacement = `const URLParse = (url, base) => {\n    try {\n        return new URL(url, base);\n    }\n    catch {\n        return null;\n    }\n};`;

async function main() {
  await patchFile(oauth4webapiFile, original, replacement, '[postinstall] oauth4webapi URL.parse compatibility patch');

  const mswOriginal = `if (options.path) {\n\t\tconst parsedOptionsPath = (0, node_url.parse)(options.path, false);\n\t\turl.pathname = parsedOptionsPath.pathname || \"\";\n\t\turl.search = parsedOptionsPath.search || \"\";\n\t}`;

  const mswReplacement = `if (options.path) {\n\t\tconst parsedOptionsPath = (() => {\n\t\t\tconst pathValue = options.path;\n\t\t\tconst queryIndex = pathValue.indexOf('?');\n\t\t\tconst hashIndex = pathValue.indexOf('#');\n\t\t\tconst endIndex = queryIndex >= 0 ? queryIndex : hashIndex >= 0 ? hashIndex : pathValue.length;\n\t\t\treturn {\n\t\t\t\tpathname: pathValue.slice(0, endIndex),\n\t\t\t\tsearch: queryIndex >= 0 ? pathValue.slice(queryIndex, hashIndex >= 0 && hashIndex > queryIndex ? hashIndex : pathValue.length) : \"\",\n\t\t\t};\n\t\t})();\n\t\turl.pathname = parsedOptionsPath.pathname || \"\";\n\t\turl.search = parsedOptionsPath.search || \"\";\n\t}`;

  await patchFile(mswInterceptorsFile, mswOriginal, mswReplacement, '[postinstall] @mswjs/interceptors url.parse compatibility patch');
}

async function patchFile(targetFile, originalSnippet, replacementSnippet, logLabel) {
  let contents;

  try {
    contents = await readFile(targetFile, 'utf8');
  } catch {
    console.log(`${logLabel} skipped; file not found.`);
    return;
  }

  if (!contents.includes(originalSnippet)) {
    console.log(`${logLabel} already applied or upstream changed.`);
    return;
  }

  const patched = contents.replace(originalSnippet, replacementSnippet);
  await writeFile(targetFile, patched, 'utf8');
  console.log(`${logLabel} applied.`);
}

main().catch((error) => {
  console.error('[postinstall] Failed to apply oauth4webapi patch:', error);
  process.exitCode = 1;
});