# Wallet disconnect

`VellarWallet` has no `disconnect()`. `withDisconnect(wallet)` adds one without
changing `src/`:

- `disconnect()` clears the local session view only — no passkey prompt, no
  RPC call, nothing on-chain. It is idempotent and safe before `connect()`.
- A `pay()` already in flight is **not aborted**. It runs to completion and
  resolves with its hash (or rejects with its own error), so a payment is never
  silently lost. `pendingPayments` tells a UI how many are still running.
- `pay()` started after `disconnect()` throws `WalletNotReadyError`.
- `connect()` / `create()` on the wrapper re-enable it.

```ts
const w = withDisconnect(createVellarWallet(config));
await w.connect();
const inFlight = w.pay({ to, amount, token });
w.disconnect(); // user navigated away
await inFlight; // still settles
```

## README API row (needs a maintainer — outside `contrib/`)

| `disconnect()` | Clear the local session — no prompt, no RPC, nothing on-chain. An in-flight `pay()` completes; new `pay()` calls throw `WalletNotReadyError` |

## Tests

```sh
npx vitest run contrib/examples/wallet-disconnect
```
