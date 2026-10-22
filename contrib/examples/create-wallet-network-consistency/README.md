# CreateWalletInput network consistency test

`CreateWalletInput.network` is not an independent choice: it must equal the
network the wallet was configured with. The connector already rejects a
conflicting value with `WalletNetworkMismatchError` (message names both
networks) before any passkey prompt or backend call. This test pins that
behaviour, plus the matching-network happy path.

## Suggested doc comment for `src/types.ts` (needs a maintainer — outside `contrib/`)

```ts
/**
 * Input to `WalletConnector.createWallet`. `network` must equal the network the
 * wallet/connector was configured with (`createVellarWallet({ network })`); a
 * different value is rejected with `WalletNetworkMismatchError` (naming both
 * networks) before any passkey prompt or RPC call. `wallet.create()` fills it
 * in from the config.
 */
```

## Tests

```sh
npx vitest run contrib/examples/create-wallet-network-consistency
```
