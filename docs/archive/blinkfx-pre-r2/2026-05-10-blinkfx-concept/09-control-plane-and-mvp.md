# 09 — Control Plane and MVP Architecture

## Desired product model

```text
/          = fullscreen Blink output client
/control   = responsive operator / host UI
```

The host UI should be able to:

- inspect installed packages
- select active effect
- set controls
- trigger transitions
- install / uninstall packages
- monitor runtime state

The output client should:

- render
- own or connect to audio input
- apply commands
- publish state snapshots

## Transport reality check

### WebSocket

A browser `WebSocket` object connects to a **server**. Browsers do not directly listen for incoming WebSocket connections. Therefore two browser pages cannot make a pure direct WebSocket connection without a server-side endpoint.

### WebRTC

`RTCDataChannel` can carry peer-to-peer data directly between browsers, but WebRTC still requires a signalling path to establish the connection.

### Same-browser / same-origin shortcut

For two tabs in the same browser and same origin, `BroadcastChannel` is a simple direct local option, but it is not WebSocket and is not suitable as the only design if remote devices should control the output.

## MVP transport recommendation

Use a **tiny local WebSocket broker** on `localhost:1337`.

```text
output client  ─┐
                ├── ws://localhost:1337 ── local broker
control client ─┘
```

Reasons:

- matches the originally intended WebSocket architecture
- easy to debug
- works across separate browser windows and devices on the local network if exposed appropriately
- keeps the app protocol stable while transport implementation can evolve later

## Later transport options

| Need | Transport |
|---|---|
| same-browser dev mode | `BroadcastChannel` adapter |
| local production | WebSocket broker |
| peer-to-peer remote | WebRTC DataChannel after signalling |
| hosted remote control | authenticated relay / broker |

Design the app against a transport interface so the protocol survives transport changes.

## Protocol sketch

### Message envelope

```ts
interface BlinkMessage<TType extends string = string, TPayload = unknown> {
  id: string;
  type: TType;
  payload: TPayload;
  sentAt: number;
}
```

### Control → output commands

```text
effect/list/request
effect/install/request
effect/uninstall/request
effect/activate/request
effect/control/set
effect/preset/apply
effect/transition/request
audio/source/set
runtime/status/request
```

### Output → control events

```text
runtime/status
effect/list
effect/activated
effect/control/state
effect/install/result
effect/uninstall/result
audio/source/state
runtime/error
```

## State synchronisation model

Use **command + authoritative state snapshot** rather than optimistic free-for-all mutation.

```text
control sends command
output applies command
output publishes authoritative state
control updates from output state
```

This prevents UI desync when:

- effects fail to load
- controls clamp values
- a package is missing assets
- a transition cannot be applied

## MVP feature list

### Output client

- connect to transport
- render one active effect
- publish runtime state
- expose audio source status
- load native BlinkFX packages

### Control UI

- connect to transport
- list packages
- activate package
- render controls from active manifest
- update controls live
- upload / remove packages
- show connection and runtime errors

### Broker

- route messages between one output client and one or more control clients
- track active output session
- optional simple auth token later

## Routing in Vite

Two reasonable approaches:

1. same SPA entry with route-based bootstrapping
2. multiple HTML entry points

For MVP, the simplest path is often:

- one app bundle
- route inspection at startup
- mount `OutputApp` for `/`
- mount `ControlApp` for `/control`

A second entry point can be introduced later if bundle separation becomes worthwhile.
