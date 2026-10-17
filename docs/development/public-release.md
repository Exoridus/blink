# Public release blockers and repository setup

No remote has been configured, pushed or deployed by this modernization.
`main` is the local target/default branch. On GitHub, set the repository default
branch to main and activate the prepared branch/tag rulesets after review.

## Before any public push

- Select the application license. MIT is the chosen direction for the independent
  BlinkFX specification. Blink's commercial-use policy remains undecided; the
  application LICENSE is preserved. See [licensing options](licensing-options.md).
- Review third-party scenes, embedded shader libraries, thumbnails and media under
  captured native vectors, derived tables and evidence. Foreign source scenes and
  converted corpora have been moved out of public assets and portable fixtures,
  but the preserved history still contains them. An upstream-public URL or
  conversion is not redistribution permission.
- Review private research and the complete Git history. Historical attribution footers are present (for example in ac312b4); adoption-scoped contribution checks do not certify them for publication. The local baseline
  intentionally preserves data for recovery and is not approved public history.
  Any cleanup/history rewrite requires an explicit plan, approval and recovery point.
- The intended destinations are `Exoridus/blink` and `Exoridus/blinkfx`; application
  metadata now targets the former and its default Pages path. No remote has been
  created. Keep the Node CLI package private until its distribution exists.
- Re-run redacted secret scanning over all history and the intended publication tree.
  The initial scan found no leaks, but skipped the large audio WAV in the tree scan
  and did not certify ignored scratch or binary content.
- Review unresolved development-tool audit findings. Current SCSS tools depend on
  `braces` for which the registry has no patched stable version for the reported
  deep-pattern DoS. Lint only repository-owned paths with trusted glob patterns.
  Do not present a clean security audit or force an incompatible override.

## GitHub setup after approval

Templates in `.github/rulesets/main.json` and `version-tags.json` require protected
main PR checks and restricted version tags. An administrator/maintainer role is
the explicit bypass; ordinary write access cannot push around the rules.
Confirm required-check names against actual Actions results before enforcement.
The templates require review of approval counts for a single-maintainer project.

Apply through repository Settings > Rules > Rulesets, or the authenticated
`POST /repos/{owner}/{repo}/rulesets` API with each JSON body. Set default_branch
to main through repository settings. These are server-side actions and have not
been applied locally. Optional tag creation by a release workflow needs a narrowly
authorized GitHub App/bypass identity, not a general all-actors exception.

Pages uses the official artifact/deploy workflow. Configure GitHub Actions as its
publishing source and set `BLINK_PAGES_ENABLED=true` only after separate deployment
approval. `BLINK_BASE` defaults to `/blink/`; set it to the actual repository path,
or `/` for a custom-domain root. The workflow first builds and checks the exact base.
Until opt-in, the workflow builds artifacts without deploying them.

The public artifact contains explicitly listed MIT-declared native examples and
curated documentation only. This limits artifact contents but does not resolve
the license/provenance of the source repository or its history. Pages is static;
the future broker needs its own authenticated HTTPS/WSS host.

The unused AWS buildspec has been removed from the intended publication tree,
with its local recovery copy preserved. Typed VPS deployment tooling remains
available for existing deployments and is not called by CI or Pages.
