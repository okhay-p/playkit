# Dependency decisions

- Before introducing or replacing any direct library dependency, inform the user of the package, its purpose, and the reason for adding it. This includes runtime dependencies, development tools, plugins, and dependencies introduced by scaffolding.
- Use the agreed choices in `docs/tech-stack.md`. Proposed alternatives and supporting libraries are not automatically selected.
- Maintain an explicit direct-dependency list and commit the lockfile when implementation begins. Summarize significant transitive dependency changes rather than presenting transitive packages as independently chosen libraries.
- The user requested advance notice, not an extra permission step for every already-agreed package. Continue within the authorized implementation scope after giving the required notice.

# Development and validation

- Work on feature branches and open pull requests targeting `main`. Do not push directly to `main` or bypass its required checks.
- During development, run `npm run check`, `npm run format:check`, and relevant Chromium browser tests with `npm run test:e2e`. Use `npm run test:watch` for unit-test feedback.
- `npm run test:e2e` and its `test:e2e:quick` alias run desktop/touch Chromium only. Use `npm run test:e2e:full` when a full local browser run is explicitly needed.
- Pull requests to `main` run the full browser matrix in GitHub Actions. Merge only after the required `Quality gate` succeeds on the current PR revision and the branch is up to date with `main`.
