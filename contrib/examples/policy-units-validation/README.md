# PolicyDefinition spending-limit unit validation

`validatePolicyDefinitionUnits(definition)` checks that
`spendingLimits.dailyXlm` and `perTxXlm` are non-negative decimal XLM strings
(at most 7 decimal places), and that `perTxXlm` does not exceed `dailyXlm`.
`assertValidPolicyDefinitionUnits` is the throwing variant
(`InvalidPolicyDefinitionError`, carrying `errors`).

## Stroop heuristic

A whole-number string larger than 50,000,000,000 (roughly the total XLM supply)
cannot be a real XLM limit and is flagged as a probable stroop amount (1 XLM =
10,000,000 stroops). Values with a decimal point are never flagged, and smaller
stroop amounts are indistinguishable from legitimate XLM values, so they pass.

## Prerequisite

The client-side validation path tracked by issue #448 has not landed, so this is
standalone. Call it before `wallet.policies.generate(definition)`; once #448
lands, call it from that path and surface `errors`.

## Tests

```sh
npx vitest run contrib/examples/policy-units-validation
```
