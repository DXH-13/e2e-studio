# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Console runs in the browser and inside an Electron shell on Windows; the Electron build wraps the same web UI, so the design language is web.)

## Users

QA engineers and developers working together on the same product.

- **QA** author no-code test cases with keywords (Open Browser, Click, Send Keys, Verify Text…) or the web recorder, manage the Object Repository, test data, global variables, suites and schedules.
- **Developers** read results: step-by-step live progress, Playwright reports, run history, and failures to debug.

Both groups may switch between English and Vietnamese UI.

## Product Purpose

E2E Studio is a commercial no-code end-to-end testing tool for web applications, built on Playwright. It lets teams create, organize, schedule and run browser tests without writing code, then see exactly what happened in each step. Success means a QA engineer can go from "record a flow" to "scheduled, passing suite with a readable report" without touching TypeScript, and a developer can trust and act on a failure from the report alone.

## Positioning

- **Offline, no cloud.** A local Node server with SQLite (`node:sqlite`); the Windows build ships as a standalone `E2EStudio.exe` bundling server, test runner and Playwright browser. Test data, results and the database live next to the executable.
- **Bilingual English / Vietnamese** across the whole console.
- **Lightweight, dependency-free.** The console server has zero npm dependencies; the frontend is vanilla JS. Tests run on real Playwright, not a proprietary engine.
- **Live run visibility.** Results for each step stream into the console while the test is running.

## Operating Context

- Console at `http://127.0.0.1:5077` (port via `PORT`), or the Windows desktop app.
- Projects (called "partners" in `e2e/config/partners.json`) each own `testcases/` (`.tc`), `objects/` (`.to`) and `testsuites/`.
- Devices/viewports from `e2e/config/devices.json`, environments from `e2e/config/environments.json`.
- Runs also available from the CLI: `npm test -- --partner <code>`.
- Exported test data and `.env` files may contain secrets and are never committed.

## Capabilities and Constraints

- Keyword-driven test case editor, web recorder, Object Repository, test data / datasets, global variables, test suites, cron scheduling, live step results, Playwright HTML reports, run history.
- Light and dark themes; theme choice persisted per browser.
- Node.js 22.13+ required. Desktop app and packaging are Windows-only for now.
- Frontend must stay vanilla JS with no framework or UI library.
- Open: pricing, licensing model, and target market size are undecided and must not be stated in product copy.

## Brand Commitments

- Product name: **E2E Studio**.
- Existing app icon: blue → violet rounded square with a lab flask (favicon in `console/web/index.html`, assets in `console/desktop/assets/`).

## Evidence on Hand

- Demo project `demo` with two runnable test cases against the bundled sample site `console/web/demo/`.
- No customers, testimonials, benchmarks, case studies or press exist yet. Do not fabricate any.

## Product Principles

1. **Never require code.** Every capability reachable in the console must work without editing TypeScript or JSON by hand.
2. **Show the truth of a run.** What the user sees during and after a run must match what Playwright actually did, step by step.
3. **Local and self-contained.** No feature may require a cloud service or network access to function.
4. **Two languages, one product.** Every new string ships in both English and Vietnamese; layouts must hold for both lengths.
5. **Stay light.** Prefer native browser and Node capabilities over adding dependencies.

## Accessibility & Inclusion

- The console has a contrast check (`console/npm run check:contrast`); color changes must keep it passing in both light and dark themes.
- Vietnamese diacritics must render correctly in every font and component.
