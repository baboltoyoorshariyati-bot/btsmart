# UI source sections

Edit these ordered source sections, not `public/app.js` or `public/ui2.js`.
`manifest.json` declares the only supported composition order. Run:

```sh
npm run build:ui
npm run check:ui
```

Commit both changed sections and generated public bundles; then regenerate repository
checksums using `python3 scripts/update-checksums.py` and run the tests.

These are classic-script source sections, **not independent ES modules**. Some
sections contain historical overrides and duplicate declarations. Concatenation
retains the established shared scope, declaration hoisting and exact bytes. Do not
load individual sections with separate script tags or add per-section wrappers.
This first decomposition changes ownership/editing boundaries only; eliminating
legacy globals, duplicate implementations and Proxy-backed state is separate work.
