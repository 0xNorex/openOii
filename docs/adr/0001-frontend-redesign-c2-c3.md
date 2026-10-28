# Frontend redesign: contract-first batches + interaction freeze

We are redesigning the entire frontend for density and visual consistency, but not as a single mega-PR. Delivery is **Design Contract first**, then **domain batches** that can merge independently. **Interaction Freeze** is mandatory: primary creator operations (Agent Column chat, canvas selection binding, cell regenerate, generate/confirm/cancel, viewport-locked shell) keep their semantics; only presentation and density change. Alternatives rejected: critical-path-only redesign (insufficient for stated “every component” goal) and big-bang pixel rewrite (breaks demo stability and KISS).

> Partially superseded by [ADR 0010](0010-studio-redesign.md) (2026-10-28).
