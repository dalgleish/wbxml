# Releasing wbxml

1. CI is green on Node 24 and 26 (`npm test`, `npm run test:types`, `npm run check:package`).
2. Run the long fuzz pass on a random seed and keep the printed seed if it fails:
   `WBXML_RUNS=1000000 WBXML_SEED=random npm test`
   Turn any crasher into a named vector before releasing.
3. `npm pack --dry-run` lists only `lib/*.js`, `lib/*.d.ts`, each language's table module and `.d.ts`, plus `package.json`, `README.md` and `LICENSE`.
4. Publish from an npm account that maintains `wbxml` (today only `metafedora`). `prepublishOnly` runs `check:package`, `test` and `test:types`.

Open: npm provenance and `publishConfig`.
