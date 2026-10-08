# Playkit

A webapp that helps people play physical games together. A shared device is the default; personal phones are optional.

Planned features:

- No-limit Texas Hold’em betting, stack tracking, and showdown settlement for physical cards.
- Optional synchronized poker sessions over WebRTC.
- A shared-device chess clock.

The project is currently in the specification stage. See [the implementation spec](docs/implementation-spec.md) for agreed behavior, architecture, and delivery milestones.

This is the **throwaway `prototype/ui-variants` branch**. It also contains [three interactive UI prototypes](prototype/README.md), not the production application. Run `npm install` once, then `npm run prototype` and open `/prototype/?variant=A`. Compare layouts with the floating bottom bar.
