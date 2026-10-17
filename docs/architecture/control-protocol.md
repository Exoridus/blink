# Blink control protocol v1

Status: proposed application contract for later implementation. No broker exists
in this delivery. The protocol identifier is `blink-control/1`; HTTP is rooted at
`/api/v1`, with a WebSocket endpoint `/api/v1/events`. Format/script versions are
independent. Incompatible wire changes require a protocol major bump.

## Ownership and roles

The renderer browser owns GPU resources, audio devices, controls, current effect,
frame execution and runtime state. The broker owns authentication, connection
registry, command routing, bounded request acknowledgements and source revisions.
It never runs a second copy of renderer state or claims that queued commands have
changed an instance. Runtime snapshots originate in the renderer.

| Role       | Permissions                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Renderer   | Register its instance, advertise capabilities, answer routed requests, publish its state/telemetry |
| Controller | Discover permitted instances, request snapshots, send capability-authorized commands and subscribe |
| Observer   | Discover/read/subscribe to permitted instances; cannot mutate state or projects                    |

The broker binds a connection to its authenticated identity/role and allowed
instance IDs. A client cannot select its role merely by sending JSON. Project
revision writes require an additional `project:write` capability. Role checks
apply consistently to HTTP and WebSocket traffic.

## Identity, capabilities and envelopes

`instanceId` is a stable UUID for a renderer installation/session identity.
`sessionId` is a fresh UUID on registration/reconnection. `stateEpoch` changes
after a renderer restart; revisions are monotonically increasing safe integers
within an epoch. Registration advertises protocol version, display name,
supported command identifiers, backends, host inputs and script/audio features.
Unknown required versions/capabilities reject registration or commands explicitly.

Every command has `requestId`, `instanceId`, `sessionId`, `command`, and validated
`arguments`; it may include `expectedStateRevision`. Results contain the same IDs,
`status` (`applied`, `rejected` or `unknown`), renderer `stateEpoch`/`stateRevision`,
and a structured error `{ code, message, path? }` when applicable. The broker
assigns role/session metadata; clients cannot spoof the renderer acknowledgement.

Initial command identifiers are `effect.activate`, `control.set`, `control.bang`,
`preset.apply`, `output.configure` and `state.snapshot`. Their adapters reuse
ShellHost and the runtime's transactional effect-switch and control contracts.
Control metadata/value encoding is JSON-safe; typed arrays become arrays on wire.
Unknown controls, nonfinite numbers, wrong vector arity and unadvertised commands
are validation errors. Bang is an event, never stored as a durable control value.

## HTTP operations and acknowledgements

| Endpoint                        | Behavior                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| `GET /instances`                | Permitted connected/disconnected registrations and capabilities   |
| `GET /instances/{id}/state`     | Query the connected renderer for a fresh snapshot                 |
| `POST /instances/{id}/commands` | Validate/authenticate, route, and await its acknowledgement       |
| `GET /commands/{requestId}`     | Bounded recent routing outcome; never a synthesized runtime state |

A successful mutation returns 200 only after the renderer confirms it applied the
command at its defined boundary. A broker receipt is not an application ack.
Malformed input returns 400, missing authentication 401, wrong role/instance 403,
missing instance 404, stale revision/session or reused ID with different content
409, excessive payload 413, rate limits 429, disconnected instance 503, and missing
renderer ack 504 with `status: unknown`. A timeout does not prove no change occurred.

Requests time out after 10 seconds; effect preparation may explicitly request up
to 30 seconds. Keep at most 128 pending commands per connection and 256 deduplication
results per renderer session for five minutes. A repeated ID with identical content
returns its recorded outcome; conflicting content fails. Reconnect never replays
mutations automatically. A renderer that lost its deduplication records cannot
promise exactly-once execution across a restart.

## Events, revisions and reconnect

Subscriptions specify permitted instance IDs and topics (`state`, `diagnostics`,
`telemetry`). The first state event is a complete renderer snapshot. Events contain
protocol, instance/session IDs, epoch, revision, topic and payload. Durable changes
increase `stateRevision`; telemetry has an independent event sequence and does not
pretend to change durable state. Snapshot/control events include accepted control
changes, with script-driven values aggregated at a bounded rate.

Disconnect marks connection metadata offline and rejects or marks pending commands
unknown. Reconnect creates a new session and requests fresh snapshots. Clients
discard old-session/epoch events. Revision gaps trigger resynchronization with the
renderer; the broker need not retain a complete event log or state cache. A stale
snapshot is never returned as fresh while a renderer is disconnected.

Cap state updates at 30 Hz and diagnostics/telemetry at 10 Hz per instance. Coalesce
pending state/telemetry by topic when a receiver is slow; reliable command results
are never silently dropped. A queue exceeding 256 messages or 1 MiB closes the
slow connection with an explicit resync reason. Limit JSON bodies to 64 KiB and
ordinary WebSocket messages to 256 KiB. Package/project uploads use separately
bounded endpoints, not the control channel.

## Security boundaries

Bind only to loopback by default. LAN/remote serving requires explicit configuration,
authentication, allowed origins/Host headers, and validated capability-scoped
inputs. Loopback still rejects unexpected browser origins; do not allow arbitrary
CORS. Browser WebSocket authentication uses a short-lived, single-use ticket
obtained through authenticated HTTP, not a reusable secret in a URL. Non-browser
clients may use an authorization header. Redact credentials from logs.

Remote deployment uses HTTPS/WSS and a configured origin allowlist. Renderer
media/autoplay permissions remain local user interactions. A controller cannot
silently grant capture permission. File/URL imports, untrusted scripts/shaders,
archive expansion and compiler resolution have independent trust and resource
policies. Web Workers are not complete security sandboxes. WebTransport is deferred.

## Later implementation gates

Implement registry/auth and HTTP/WS routing first; then ShellHost adapters and
revision services. Test two renderers, controller/observer separation, wrong-role
attempts, expired tickets, malformed payloads, command rejection/timeouts,
transactional effect failure, stale sessions/revisions, reconnect snapshots,
backpressure and standalone local behavior before publishing the protocol as stable.
