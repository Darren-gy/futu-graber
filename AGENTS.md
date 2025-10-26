# Repository Guidelines

## Project Structure & Module Organization
- Root JS modules: `adb-examples.js`, `simple-example.js`, `xmlparser.js`, `trade.js`.
- Runtime artifacts: `data.csv`, `lastcommit`, `window_dump.xml` (generated locally; do not commit).
- Assets and docs: `README.md`, `example.png`, `image.png`.
- Package management: `package.json`, `package-lock.json`; CommonJS modules targeting Node >= 12.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm start` — run `simple-example.js` (ADB-driven scraper demo).
- `npm run examples` — run `adb-examples.js` to verify ADB connectivity and helpers.
- `node trade.js` — run LongPort trading loop (reads `data.csv`, needs credentials in `keysss.txt`).
- `npm test` — alias of `simple-example.js` (no formal test runner yet).

## Coding Style & Naming Conventions
- Language: Node.js (CommonJS). Prefer single quotes, semicolons, and 2-space indentation.
- Filenames: use kebab-case for new scripts (e.g., `new-tool.js`). Keep existing names as-is.
- Functions: verbs for actions (`startApp`, `getDevices`); constants in `SCREAMING_SNAKE_CASE`.
- Avoid committing generated files (`data.csv`, `lastcommit`, `window_dump.xml`).

## Testing Guidelines
- No framework configured. If adding tests, place them in `tests/` with `*.test.js` and use Jest or node’s test runner.
- For manual checks:
  - ADB: `npm run examples` and `adb devices`.
  - Parsing: run `npm start` to dump XML and update CSV.
  - Trading: run `node trade.js` with a paper/sandbox account.

## Commit & Pull Request Guidelines
- Commits: concise imperative subject (<= 72 chars), body explains why and impact.
  - Examples: `feat(parser): extract portfolio history to CSV`, `fix(adb): guard when no devices`.
- PRs: include summary, rationale, steps to reproduce/verify, and screenshots/logs when UI/ADB flows change. Link related issues.

## Security & Configuration Tips
- Do not commit secrets (`keysss.txt`) or personal paths. Store credentials in `keysss.txt` locally and reference relative paths (e.g., `./keysss.txt`).
- Ensure ADB is installed and `DEVICE_ID` in `simple-example.js` matches your device/emulator (e.g., `emulator-5554`).
- Keep `adb` and Android platform tools updated; prefer emulators for repeatability.

