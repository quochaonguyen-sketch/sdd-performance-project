/* eslint-disable @typescript-eslint/no-require-imports -- Load the Next TypeScript config without starting a server. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } = require('next/constants');
const filename = path.resolve(__dirname, '../next.config.ts');
const configModule = new Module(filename, module);
configModule.filename = filename;
configModule.paths = Module._nodeModulePaths(path.dirname(filename));
configModule._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const config = configModule.exports.default;

test('local route manifests cannot be replaced by production build output', () => {
  const dev = config(PHASE_DEVELOPMENT_SERVER);
  const build = config(PHASE_PRODUCTION_BUILD);
  const start = config(PHASE_PRODUCTION_SERVER);
  assert.notEqual(dev.distDir, build.distDir);
  assert.equal(build.distDir, start.distDir);
  assert.equal(build.distDir, '.next');
  assert.equal(dev.experimental.turbopackFileSystemCacheForDev, false);
  assert.ok(fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8').includes(`/${dev.distDir}/`));
  const tsconfig = ts.readConfigFile(path.resolve(__dirname, '../tsconfig.json'), ts.sys.readFile).config;
  assert.ok(tsconfig.exclude.includes('.next/dev'), 'Unused legacy development types stay outside type checking');
});
