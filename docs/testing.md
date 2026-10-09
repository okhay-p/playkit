# Test performance and parallel execution

`npm run check` runs frontend and Worker type checks and all unit tests. `npm run test:e2e:full` builds the production app once, starts the local signaling Worker, and runs every browser scenario. Browser contexts isolate IndexedDB, and synchronized tests create independent rooms. Keep the production build and service worker: offline tests depend on them.

## Local execution

```sh
# Development default: desktop/touch Chromium
npm run test:e2e

# Full coverage on demand; PRs run this automatically in CI
npm run test:e2e:full

# Override the total worker count for a resource-constrained or larger machine
npm run test:e2e:full -- --workers=2
npm run test:e2e:full -- --workers=6

# Run only the relevant tool, across all browser projects
npm run test:e2e:full -- tests/e2e/chess.spec.ts

# Summarize the last run (including failed attempts)
npm run test:e2e:timings
```

Local runs default to half the available logical CPUs, capped at four workers; CI defaults to two. The CLI `--workers` option overrides the total. WebKit retains a separate one-worker cap, so increasing the total accelerates other browsers without starting competing WebKit tests. WebKit is listed first to overlap its longer workload with the other browsers rather than leave it until the end.

Desktop WebKit uses a 1× pixel ratio, matching desktop Chromium and Firefox. The Safari preset's 2× ratio quadruples the number of rasterized pixels; these tests have no pixel-level screenshot assertions. The phone Chromium project retains its device pixel ratio and touch viewport. Use `PLAYKIT_E2E_RETINA=1 npm run test:e2e:full -- --project=webkit` when validating desktop WebKit at 2×.

Mesa's `LP_NUM_THREADS` can limit each LLVMpipe software-rendering pool on Linux, but fewer threads do not necessarily mean faster rendering. With the original 2× WebKit preset and tracing enabled, the main-branch multi-phone walkthrough passed in 183.8 seconds using the default renderer settings; limiting each renderer to two threads caused a five-minute timeout. The configuration therefore leaves the renderer's default intact. To investigate a different runner, compare identical pixel ratios and trace settings:

```sh
LP_NUM_THREADS=2 npm run test:e2e:full -- --project=webkit
LP_NUM_THREADS=12 npm run test:e2e:full -- --project=webkit
```

The configuration writes `playwright-report/results.json` alongside console output. The timing summary distinguishes suite wall time from summed test duration: overlapping test durations must not be added to estimate wall time. Failure traces and screenshots remain in `test-results/`. For action-level profiling, run a focused scenario with `--trace=on`; tracing can add overhead, so compare identical trace settings.

## Pull requests and main protection

Work on feature branches and open pull requests targeting `main`. The [PR validation workflow](../.github/workflows/ci.yml) runs on every PR revision and can also be started manually. It uses standard Ubuntu runners and Node 22, installs packages with `npm ci`, and cancels superseded runs for the same PR.

The quality job runs frontend/Worker type checks, all unit tests, formatting, shell syntax checks, and the production build. Five independent browser jobs run desktop Chromium, touch Chromium, Firefox, and two WebKit shards. Every browser job starts its own production preview and local signaling Worker; no production credentials are needed. Failure traces, screenshots, and timing reports are uploaded with seven-day retention.

WebKit runners also install and start `avahi-daemon` with `libnss-mdns` for local WebRTC address resolution. Phone tests exchange `.local` ICE addresses and exercise real data channels; successful signaling alone does not establish a connection. These system packages are isolated to CI runners.

The stable `Quality gate` job runs even when upstream jobs fail or are skipped. It accepts only `success` from both the quality job and the complete browser matrix. Failed, cancelled, or skipped validation blocks the gate. `test.only` is forbidden in CI. The existing browser-independent skips remain intentional: signaling HTTP checks and ten-phone capacity checks run once in desktop Chromium.

An active GitHub branch ruleset for `main` requires a pull request, a successful `Quality gate` from GitHub Actions, an up-to-date branch, and resolved conversations. It blocks force pushes and branch deletion and has no bypass actors. Reviewer approvals are set to zero for solo development; add a reviewer requirement when a second reviewer is available. Configure these repository settings in GitHub; the workflow file alone does not protect the branch. Merge through the PR after the checks pass, rather than pushing a local merge to `main`.

## More machines

Playwright supports [sharding](https://playwright.dev/docs/test-sharding) individual tests because this suite enables `fullyParallel`. To shorten the serial WebKit workload, split it across independent runners rather than increasing WebKit concurrency on the same machine:

```sh
# Each command runs on a different runner or isolated checkout/container.
npm run test:e2e:full -- --project=webkit --shard=1/2
npm run test:e2e:full -- --project=webkit --shard=2/2

# A separate runner can execute the other browser projects at the same time.
npm run test:e2e:full -- --project=desktop --project=phone --project=firefox
```

Alternatively shard the entire browser matrix with `--shard=1/3`, `--shard=2/3`, and `--shard=3/3`. Every runner needs dependencies and its selected Playwright browsers installed, and starts its own app/Worker. Collect each runner's JSON report and failure artifacts separately. These commands do not provision runners or purchase resources.

Do not launch concurrent Playwright invocations in the same checkout: they share ports 4173/8787, build outputs, test artifacts, and `.wrangler/e2e` storage, which is cleared at startup. Independent machines or containers avoid those collisions. Tests targeting `PLAYKIT_LIVE_E2E` also share real signaling quotas; use the local Worker for performance measurements.

## Where to optimize next

On 9 October 2026, before Claude's visual upgrade, the updated configuration completed the full browser suite on this 12-logical-CPU, 15-GiB machine in **654.5 seconds (10.9 minutes)**: 82 passed, 6 intentionally skipped, no failures or retries. Type checks, all 138 unit tests, the production build, and formatting checks passed too. Summed test time was 602.3 seconds for WebKit, 352.9 for desktop Chromium, 256.3 for phone Chromium, and 536.4 for Firefox. These browser totals overlap; they are not separate wall times.

With Claude's visual upgrade, a fresh full run passed in **1146.5 seconds (19.1 minutes)**: 82 passed, 6 intentionally skipped, no failures or retries. The previously timed-out WebKit multi-phone walkthrough passed in 177.2 seconds. An earlier attempt exposed a Firefox test setup race: pausing the mocked clock at the runner's current wall time could target the browser's past. The chess test now installs its clock before navigation and pauses at an explicit later timestamp, retaining all assertions and timeouts. All four browser profiles passed that scenario in the fresh run.

WebKit's serial work remains the wall-time constraint: 602.3 seconds before the visual upgrade and 1092.4 seconds with it. Increasing the global local worker count beyond four cannot remove that one-worker constraint. Splitting WebKit or the whole matrix across independent runners is the next opportunity; measure the slowest shard including startup rather than assuming perfectly even distribution. The visual upgrade still makes the browser workflows substantially more expensive to render.

Measure renderer contention and worker scheduling first. The earlier visual-patch run with the original test configuration took 38.5 minutes and had one WebKit timeout; WebKit accounted for roughly 24 minutes of serial test time. The 19.1-minute run uses the same visual patch with the optimized configuration and clock setup fix. These are individual measured runs, not a guarantee of future runtime.

The complete-hand poker and multi-phone walkthroughs contain many intentional UI actions. Retain at least one full walkthrough per browser engine and use focused tool runs for development. Engine permutations already belong in unit tests. Reducing workflow coverage, forcing clicks, suppressing validation, or extending timeouts can obscure regressions and does not solve rendering contention.

References: [Playwright parallelism](https://playwright.dev/docs/test-parallel), [project worker caps](https://playwright.dev/docs/api/class-testproject#test-project-workers), and [Mesa renderer environment variables](https://docs.mesa3d.org/envvars.html).
