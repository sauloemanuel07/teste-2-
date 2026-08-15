import test from "node:test";
import assert from "node:assert/strict";
import {readFile, readdir, stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index.html", "login.html", "cadastro.html", "onboarding.html", "dashboard.html", "clientes.html", "veiculos.html", "ordens.html", "nova-ordem.html", "ordem.html", "acompanhar.html"];

async function walk(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : path.join(directory, entry.name)));
  return nested.flat();
}

test("páginas essenciais possuem metadados e módulos", async () => {
  for (const page of pages) {
    const html = await readFile(path.join(root, "public", page), "utf8");
    assert.match(html, /<html lang="pt-BR">/);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<script type="module"/);
  }
});

test("assets HTML e imports locais apontam para arquivos existentes", async () => {
  for (const page of pages) {
    const html = await readFile(path.join(root, "public", page), "utf8");
    const assets = [...html.matchAll(/(?:src|href)="\/(css|js)\/([^"?#]+)"/g)];
    for (const [, folder, file] of assets) await stat(path.join(root, "public", folder, file));
  }
  const modules = (await walk(path.join(root, "public", "js"))).filter((file) => file.endsWith(".js"));
  for (const module of modules) {
    const source = await readFile(module, "utf8");
    const imports = [...source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)];
    for (const [, relative] of imports) await stat(path.resolve(path.dirname(module), relative));
  }
});

test("regras negam leitura e escrita na raiz", async () => {
  const rules = JSON.parse(await readFile(path.join(root, "database.rules.json"), "utf8"));
  assert.equal(rules.rules[".read"], false);
  assert.equal(rules.rules[".write"], false);
});

test("front-end não usa banco local, mocks ou SDK legado", async () => {
  const files = (await walk(path.join(root, "public"))).filter((file) => /\.(js|html)$/.test(file));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /SUA_API_KEY|SEU_APP_ID|SEU_SENDER_ID/);
  assert.doesNotMatch(source, /firebase\.initializeApp/);
  assert.doesNotMatch(source, /alert\s*\(/);
});

test("operações privilegiadas exigem App Check", async () => {
  const source = await readFile(path.join(root, "functions", "src", "index.js"), "utf8");
  assert.match(source, /const CALLABLE_OPTIONS = \{enforceAppCheck: true\}/);
  assert.match(source, /shareLinksByHash/);
  assert.doesNotMatch(source, /serviceAccount|private_key/);
});

test("sessão do link público é isolada e não persistente", async () => {
  const source = await readFile(new URL("../public/js/public-firebase.js", import.meta.url), "utf8");
  assert.match(source, /oficlaro-public-view/);
  assert.match(source, /inMemoryPersistence/);
  assert.match(source, /setPersistence/);
});
