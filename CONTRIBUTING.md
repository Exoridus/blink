# Contributing to Blink

Use Node 24 and `npm ci`. Read the [contributor workflow](docs/development/contributing.md)
and [commit policy](docs/development/commit-policy.md) before changing repository conventions.

Keep runtime, effect-format and conversion concerns separate. Preserve the existing
multipass/audio infrastructure and use the current [BlinkFX contract](docs/blinkfx/README.md).
Run focused tests while iterating, then the affected integration checks before a push.
Do not commit generated output, private scratch, credentials or unreviewed third-party assets.

Public publication, license replacement and destructive history cleanup require
maintainer approval. A successful build is not a redistribution or deployment approval.
