# Trustline guard for `wallet.pay`

`createTrustlineGuardedPay(wallet, hasTrustline)` returns a `pay` function that
asks `hasTrustline(accountId, token)` first. On `false` it throws
`MissingTrustlineError` (carrying `account` and `token`) — before simulation and
before the passkey prompt — so it is distinguishable from a generic simulation
failure. Back `hasTrustline` with the balances RPC; skip the guard for assets
that need no trustline (native XLM, pure Soroban tokens).

## Error catalog entry (needs a maintainer — outside `contrib/`)

For `website/content/docs/reference/error-codes.md`, SDK errors table:

| `MissingTrustlineError` | The sending account has no trustline for the payment asset. Thrown before simulation and the passkey prompt. | No | Yes, after establishing the trustline |

## Tests

```sh
npx vitest run contrib/examples/trustline-guard
```
