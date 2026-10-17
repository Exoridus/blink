# Commit and provenance policy

Use a Conventional Commit subject: `type(scope): intent`. Supported conventional
types include feat, fix, docs, refactor, perf, test, build, ci, chore and revert.
Use `!` or a BREAKING CHANGE footer for incompatible contracts. Prefer a short
intent-only subject and put review/validation details in the PR description.

Commitlint enforces commit messages and PR titles. Co-authored-by trailers are
prohibited for all contributors. Commit and PR text must not contain assistant,
model or tool attribution such as generated-by notices, model names or automated
signature blocks. Do not silently strip these during commit; reject the message
so the author can correct it.

First-party source and public guides must not contain development provenance,
private scratch paths or machine-specific workspace paths. The staged/push/CI
policy scanner checks added lines. Policy files and policy test cases are explicit
exceptions because they describe/test the forbidden strings. Existing historical
research and third-party content are retained for provenance/licensing review,
not rewritten to erase attribution. Technical API usage is allowed; an actual
model identifier in executable integration code is different from an author credit.

Hooks can be bypassed locally, so GitHub CI repeats the checks. The protected main
ruleset requires policy, core and secret checks before merge. The release-tag
ruleset restricts `v*` creation, modification and deletion to maintainers with an
explicit bypass. Rulesets remain templates until a repository exists and they
have been applied through GitHub settings/API.

The adoption commit is recorded in the repository policy configuration. Existing commits before it are not rechecked as new contributions and are not rewritten automatically. New remote branches use fetched remote-main ancestry or that trusted adoption commit; a repository without either checks its entire current history.
The public-history review is a separate release blocker. Commitizen is optional;
Commitlint plus documented examples enforce the contract without another wizard.
