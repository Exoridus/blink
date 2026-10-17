# Installing packages from archives

A `.blinkfx` archive can be installed from the effect panel ("Paket installieren..."). An
installed package is listed after the bundled effects, survives a reload, and loads like any other
effect. Archives are produced by `blinkfx pack` (see [blinkfx-cli.md](blinkfx-cli.md)).

## What install does

1. The archive is read in memory. An entry whose name is absolute or climbs out of the package
   rejects the whole archive.
2. The package is validated with the same checks as `blinkfx validate`: manifest, references,
   files, shader includes. A package with an error finding is not installed; the panel shows the
   first findings.
3. The package id must not be the id of a bundled effect. Two entries with one id would make the
   list ambiguous about which one loads.
4. The archive is stored under its id, together with its SHA-256, size and a last-used time.

Installing the same archive again (same hash) only refreshes its last-used time. Installing a
different archive under an installed id replaces the old one.

An installed package can be removed from its entry in the list. A bundled effect cannot, and the
running effect cannot, because its files are served from the package being removed.

## Storage and cache

Archives are kept in IndexedDB (database `blink-packages`): the info of every package in one
object store and the archive bytes in another, so listing the installed packages never reads an
archive. Where IndexedDB is not available, packages install for the current session only.

The cache holds at most 256 MiB of archives. Installing past that evicts the packages used least
recently, never the one being installed; an archive larger than the whole cache is refused. Opening
a package counts as using it.

## How an installed package is served

An installed package has no URL. When it is opened, its archive is validated again, which catches a
store that was damaged since the install, and mounted in memory under `blinkfx-installed/<id>` (the
id URL-encoded, so it cannot add path segments). Every package file load in the runtime (shaders and
their includes, assets, presets, scripts) goes through `fetchPackageFile`, which answers a path
under a mounted root from memory and sends everything else to the network. A mounted path that
leaves the package, or names a file it does not hold, is a 404 and never reaches the network.

## Trust

A package may contain a script. An installed package's script runs with the rights of the page,
exactly like a bundled one: the `blink/1` module is imported by the browser's module loader and the
`ssf/1` script is evaluated in the page. Install archives from sources you trust. The install
button says so in its tooltip.
