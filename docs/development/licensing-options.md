# Licensing options for Blink and BlinkFX

Status: decision support, checked against primary license texts on 2026-10-14.
No application license is selected or replaced by this document. The repository LICENSE
remains unchanged pending the maintainer's decision and a rights inventory.

## Two separate decisions

The intended policy is a portable, MIT-licensed BlinkFX contract and a publicly
inspectable Blink application whose product redistribution/competitive reuse can
require separate permission. Ordinary professional operation should remain a
separate consideration. Those can be separate licensing
scopes, but each needs an explicit file/package boundary. A format name or archive
extension does not assign a license to shaders, scripts, textures, music or
third-party packages carried in an effect.

For BlinkFX, identify the specification text, schema, declarations, conformance
code and original examples that the project owns and wants to release under MIT.
State those scopes in their future distribution. Keep every third-party example
and asset under its own applicable terms. MIT permissions do not extend to content
the maintainer cannot license.

## What the candidate licenses permit

| Candidate                    | Commercial use                                                   | Modification and redistribution                                                  | Fit for the stated Blink policy                                                  |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| MIT                          | Allowed, including sale                                          | Broad permission with retained copyright/license notice                          | Fits an openly reusable BlinkFX contract; does not restrict Blink commercial use |
| Apache-2.0                   | Allowed                                                          | Broad permission plus notices, change indications and explicit patent terms      | Does not implement a noncommercial restriction                                   |
| GPL-3.0                      | Allowed, including paid distribution                             | Copyleft obligations apply when conveying covered works                          | Useful for reciprocal source rights; does not ban paid shows or commercial forks |
| AGPL-3.0                     | Allowed                                                          | GPL-style obligations plus source offer for network users of modified versions   | Addresses network source availability; does not ban commercial operation         |
| PolyForm Noncommercial 1.0.0 | Permitted purposes govern; commercial use requires another grant | Allows changes/new works and redistribution for permitted purposes, with notices | Closest standard candidate for community modification with commercial licensing  |
| PolyForm Strict 1.0.0        | Permitted purposes govern                                        | Does not grant distribution or modification/new-work rights                      | Poor fit if outside contributions and forks are desired                          |

MIT explicitly allows use, modification, distribution, sublicensing and sale,
subject to retaining its notice. Apache-2.0 grants broad copyright and patent
permissions and its foundation confirms commercial use is allowed. Apache's
patent and notice provisions are reasons to choose it for a permissive project,
not a mechanism to restrict commercial users.
[MIT text](https://opensource.org/license/mit),
[Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0),
[Apache licensing FAQ](https://www.apache.org/foundation/license-faq.html).

GPL and AGPL allow commercial use and selling copies. Their purpose is preserving
specified user/source freedoms. AGPL section 13 concerns corresponding source
access for users interacting remotely with a modified program; it is not a
prohibition on charging, running a business or playing a paid show. Calling a
license GPL/AGPL while adding a commercial-use ban misstates the standard license.
[GNU license FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#DoesTheGPLAllowMoney),
[AGPL section 13](https://www.gnu.org/licenses/agpl-3.0.html#section13).

PolyForm Noncommercial grants modification and redistribution for its permitted
purposes, with notice requirements and a patent grant. Its personal-use examples
exclude anticipated commercial application, but its listed noncommercial
organizations have broader permissions regardless of funding. It does not express
the same rule as simply forbidding every transaction involving money. Strict uses
the permitted-purpose model but withholds grants for redistribution and changed
or new works. These are source-available restrictions, not permissive open-source
licenses. Use the published standard texts rather than inventing extra clauses.
[PolyForm Noncommercial](https://polyformproject.org/licenses/noncommercial/1.0.0),
[PolyForm Strict](https://polyformproject.org/licenses/strict/1.0.0),
[PolyForm comparison](https://polyformproject.org/licenses).

## Paid shows are a product-policy question

Restricting commercial use can affect the intended VJ audience: a paid performance,
venue installation, client rehearsal, production company or software service can
have a commercial purpose. Treat this as an application of the proposed restriction
requiring a policy decision, not as a categorical legal ruling for every event.
Decide whether the aim is to restrict operating Blink commercially, reselling or
hosting Blink, proprietary derivatives, or competing products. Those are different
policies; a standard noncommercial license may block more than the intended target.

If paid performances should be allowed without negotiation, a general
noncommercial restriction is an awkward fit. If all commercial operation should
require permission, PolyForm Noncommercial plus a separate commercial license is
the clearer candidate. Strict is narrower for recipients and makes community
changes and redistribution harder. Do not select Apache-2.0 as a compromise: it
would authorize the very commercial uses the proposed restriction seeks to reserve.

## Dual licensing and ownership

A rights holder can offer covered Blink code under PolyForm Noncommercial and
also offer separate commercial permissions. That requires an explicit commercial
offering and authority over the covered contributions. This document does not
draft its legal terms. Decide contributor rights and approval processes before
promising a commercial license to customers.

Publishing the same Blink code under MIT or Apache-2.0 as an alternative would
let recipients choose those commercial permissions. That defeats a commercial
use restriction for that code. Keeping BlinkFX contract artifacts under MIT and
Blink application artifacts under a separately chosen license instead preserves
the intended scope distinction. An application package must still explain the
licenses of included dependencies and format artifacts.

Changing a project license does not revoke previously granted third-party rights
or retroactively change licenses on existing releases. It also cannot grant
ownership or redistribution permission for imported SSF scenes, converted
packages, assets, libraries or native SDKs. Conversion and preservation of source
bytes do not create permission to relicense the original work.

Before any license replacement, inventory original code, contributors,
dependencies, imported effects and generated packages. Establish ownership and
compatible terms for each intended distribution; preserve required notices and
exclude private corpora. NDI runtime/SDK permissions need their own versioned
review and are not supplied by either the Blink or BlinkFX license. See
[output transport evaluation](../architecture/output-transports.md).

## Broader noncommercial option

If all commercial operation were to require permission, PolyForm Noncommercial
plus a separate commercial license would be a candidate. That broad restriction
is not the current preferred product policy. GPL/AGPL instead offer reciprocal
source rights while permitting commercial competitors. Keep the existing LICENSE
until the exact application terms and distribution rights are settled.

## Current preference: professional operation allowed

The intended restriction now concerns redistribution or incorporation into other
products, rather than ordinary paid VJ, club or festival operation. A blanket
noncommercial license is therefore not the preferred direction.

CC BY-NC-ND 4.0 is not recommended for application code. Creative Commons itself
recommends software-specific licenses; its licenses do not address software patent
rights or source-code distribution requirements. NC restricts commercial exercises
of the licensed rights, and ND prohibits sharing adapted material. Those conditions
do not express a precise distinction between running Blink commercially and
reselling or incorporating the application.
[Creative Commons software FAQ](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software),
[CC BY-NC-ND terms](https://creativecommons.org/licenses/by-nc-nd/4.0/).

PolyForm Shield is a closer standard candidate if the actual concern is competing
software products. It allows purposes other than providing a product competing
with the software. It does not prohibit all resale or all incorporation into other
products: noncompeting integration may remain permitted. It must not be presented
as an exact implementation of a blanket redistribution restriction.
[PolyForm Shield](https://polyformproject.org/licenses/shield/1.0.0).

If every commercial resale or incorporation must require permission while normal
professional operation remains free, obtain a software-specific license reviewed
for that exact scope. Define modification rights, community patch redistribution,
hosting, plugins, derived outputs and contributor permissions explicitly. No
custom legal terms are supplied here. Application LICENSE stays unchanged until
the owner approves concrete terms.
