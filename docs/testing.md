# Test performance and parallel execution

`npm run check` runs frontend and Worker type checks and all unit tests. `npm run test:e2e` builds the production app once, starts the local signaling Worker, and runs every browser scenario. Browser contexts isolate IndexedDB, and synchronized tests create independent rooms. Keep the production build and service worker: offline tests depend on them.

## Local execution

```sh
# Full coverage: desktop/touch Chromium, Firefox, WebKit
npm run test:e2e

# Faster feedback while implementing; follow with the full suite before release
npm run test:e2e:quick

# Override the total worker count for a resource-constrained or larger machine
npm run test:e2e -- --workers=2
npm run test:e2e -- --workers=6

# Run only the relevant tool, across all browser projects
npm run test:e2e -- tests/e2e/chess.spec.ts

# Summarize the last run (including failed attempts)
npm run test:e2e:timings
```

Local runs default to half the available logical CPUs, capped at four workers; CI defaults to two. The CLI `--workers` option overrides the total. WebKit retains a separate one-worker cap, so increasing the total accelerates other browsers without starting competing WebKit tests. WebKit is listed first to overlap its longer workload with the other browsers rather than leave it until the end.

Desktop WebKit uses a 1× pixel ratio, matching desktop Chromium and Firefox. The Safari preset's 2× ratio quadruples the number of rasterized pixels; these tests have no pixel-level screenshot assertions. The phone Chromium project retains its device pixel ratio and touch viewport. Use `PLAYKIT_E2E_RETINA=1 npm run test:e2e -- --project=webkit` when validating desktop WebKit at 2×.

Mesa's `LP_NUM_THREADS` can limit each LLVMpipe software-rendering pool on Linux, but fewer threads do not necessarily mean faster rendering. With the original 2× WebKit preset and tracing enabled, the main-branch multi-phone walkthrough passed in 183.8 seconds using the default renderer settings; limiting each renderer to two threads caused a five-minute timeout. The configuration therefore leaves the renderer's default intact. To investigate a different runner, compare identical pixel ratios and trace settings:

```sh
LP_NUM_THREADS=2 npm run test:e2e -- --project=webkit
LP_NUM_THREADS=12 npm run test:e2e -- --project=webkit
```

The configuration writes `playwright-report/results.json` alongside console output. The timing summary distinguishes suite wall time from summed test duration: overlapping test durations must not be added to estimate wall time. Failure traces and screenshots remain in `test-results/`. For action-level profiling, run a focused scenario with `--trace=on`; tracing can add overhead, so compare identical trace settings.

## More machines

Playwright supports [sharding](https://playwright.dev/docs/test-sharding) individual tests because this suite enables `fullyParallel`. To shorten the serial WebKit workload, split it across independent runners rather than increasing WebKit concurrency on the same machine:

```sh
# Each command runs on a different runner or isolated checkout/container.
npm run test:e2e -- --project=webkit --shard=1/2
npm run test:e2e -- --project=webkit --shard=2/2

# A separate runner can execute the other browser projects at the same time.
npm run test:e2e -- --project=desktop --project=phone --project=firefox
```

Alternatively shard the entire browser matrix with `--shard=1/3`, `--shard=2/3`, and `--shard=3/3`. Every runner needs dependencies and its selected Playwright browsers installed, and starts its own app/Worker. Collect each runner's JSON report and failure artifacts separately. These commands do not provision runners or purchase resources.

Do not launch concurrent Playwright invocations in the same checkout: they share ports 4173/8787, build outputs, test artifacts, and `.wrangler/e2e` storage, which is cleared at startup. Independent machines or containers avoid those collisions. Tests targeting `PLAYKIT_LIVE_E2E` also share real signaling quotas; use the local Worker for performance measurements.

## Where to optimize next

On 9 October 2026, the updated main-branch configuration completed the full browser suite on this 12-logical-CPU, 15-GiB machine in **654.5 seconds (10.9 minutes)**: 82 passed, 6 intentionally skipped, no failures or retries. Type checks, all 138 unit tests, the production build, and formatting checks passed too. Summed test time was 602.3 seconds for WebKit, 352.9 for desktop Chromium, 256.3 for phone Chromium, and 536.4 for Firefox. These browser totals overlap; they are not separate wall times.

WebKit's 602.3 seconds of serial work accounts for almost all the wall time after server startup. Increasing the global local worker count beyond four cannot remove that one-worker constraint. Splitting WebKit or the whole matrix across independent runners is the next opportunity; measure the slowest shard including startup rather than assuming perfectly even distribution. The longest individual scenario is the physical-hand WebKit walkthrough at 110.6 seconds.

Measure renderer contention and worker scheduling first. The earlier visual-patch run took 38.5 minutes; WebKit accounted for roughly 24 minutes of serial test time. That is a historical run of a different UI, not a controlled before/after measurement of this configuration.

The complete-hand poker and multi-phone walkthroughs contain many intentional UI actions. Retain at least one full walkthrough per browser engine and use focused tool runs for development. Engine permutations already belong in unit tests. Reducing workflow coverage, forcing clicks, suppressing validation, or extending timeouts can obscure regressions and does not solve rendering contention.

References: [Playwright parallelism](https://playwright.dev/docs/test-parallel), [project worker caps](https://playwright.dev/docs/api/class-testproject#test-project-workers), and [Mesa renderer environment variables](https://docs.mesa3d.org/envvars.html).
