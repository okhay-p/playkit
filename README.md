# Playkit

A webapp that helps people play physical games together. A shared device is the default; personal phones are optional.

Planned features:

- No-limit Texas Hold’em betting, stack tracking, and showdown settlement for physical cards.
- Optional synchronized poker sessions over WebRTC.
- A shared-device chess clock.

The project is currently in the specification stage. See [the implementation spec](docs/implementation-spec.md) for agreed behavior, architecture, and delivery milestones.

The selected UI direction is [A — Table Club](docs/ui-direction.md). Interactive comparison prototypes are preserved on the [`prototype/ui-variants` branch](https://github.com/okhay-p/playkit/tree/prototype/ui-variants).

Agreed frontend: React + Vite, Tailwind CSS, and TanStack Router. Multiplayer will use native WebRTC. See [tech stack decisions](docs/tech-stack.md) for supporting choices still under discussion.
