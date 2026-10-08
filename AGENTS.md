# Dependency decisions

- Before introducing or replacing any direct library dependency, inform the user of the package, its purpose, and the reason for adding it. This includes runtime dependencies, development tools, plugins, and dependencies introduced by scaffolding.
- Use the agreed choices in `docs/tech-stack.md`. Proposed alternatives and supporting libraries are not automatically selected.
- Maintain an explicit direct-dependency list and commit the lockfile when implementation begins. Summarize significant transitive dependency changes rather than presenting transitive packages as independently chosen libraries.
- The user requested advance notice, not an extra permission step for every already-agreed package. Continue within the authorized implementation scope after giving the required notice.
