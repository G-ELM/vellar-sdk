import type { PolicyDefinition } from "../../../src/types";
import type { ValidationResult } from "../../../src/policy-types";

// Client-side conformance check for PolicyDefinition.spendingLimits: the field
// names promise XLM (`dailyXlm`, `perTxXlm`), so a caller-supplied value must be
// a non-negative decimal string in XLM — not a stroop amount, not free text.
//
// PREREQUISITE: this is NOT yet wired into the facade's generate() path. The
// client-side validation path tracked by issue #448 has not landed; once it
// does, call `validatePolicyDefinitionUnits` from there and surface `errors`.
// Until then, integrators can call it directly before `wallet.policies.generate`.

/** Stellar amounts have 7 decimal places (1 XLM = 10^7 stroops). */
const STROOP_DECIMALS = 7;

/**
 * Stroop-looking heuristic: a whole-number string (no decimal point) whose XLM
 * value exceeds the total XLM supply (~50 billion XLM, i.e. 50_000_000_000)
 * cannot be a real XLM limit, yet a stroop amount of a realistic limit easily
 * reaches that size (e.g. "100000000000000" is 10,000,000 XLM as stroops,
 * but 100 trillion XLM as written). Only integers are flagged — a fractional value
 * clearly reads as XLM. Smaller stroop amounts are indistinguishable from
 * legitimate XLM values and are deliberately not flagged.
 */
const MAX_PLAUSIBLE_XLM = 50_000_000_000n;

type LimitField = "dailyXlm" | "perTxXlm";

/** Parses a non-negative decimal XLM string into stroops; null if malformed. */
function parseXlmToStroops(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > STROOP_DECIMALS) return null;
  return BigInt(whole) * 10n ** BigInt(STROOP_DECIMALS) + BigInt(fraction.padEnd(STROOP_DECIMALS, "0"));
}

function checkField(field: LimitField, value: string, errors: string[]): bigint | null {
  const stroops = parseXlmToStroops(value);
  if (stroops === null) {
    errors.push(
      `spendingLimits.${field} "${value}" is not a valid non-negative decimal XLM amount (max ${STROOP_DECIMALS} decimal places)`,
    );
    return null;
  }
  if (!value.includes(".") && BigInt(value.trim()) > MAX_PLAUSIBLE_XLM) {
    errors.push(
      `spendingLimits.${field} "${value}" looks like a stroop amount: it exceeds the total XLM supply as XLM. Limits are in XLM (1 XLM = 10000000 stroops)`,
    );
    return null;
  }
  return stroops;
}

/**
 * Validates the units of a PolicyDefinition's spendingLimits. Collects every
 * problem rather than stopping at the first. A definition with no
 * spendingLimits (or an absent field) is valid — the fields are optional.
 */
export function validatePolicyDefinitionUnits(definition: PolicyDefinition): ValidationResult {
  const errors: string[] = [];
  const limits = definition.spendingLimits;
  if (limits) {
    const daily = limits.dailyXlm === undefined ? undefined : checkField("dailyXlm", limits.dailyXlm, errors);
    const perTx = limits.perTxXlm === undefined ? undefined : checkField("perTxXlm", limits.perTxXlm, errors);
    if (daily != null && perTx != null && perTx > daily) {
      errors.push(
        `spendingLimits.perTxXlm "${limits.perTxXlm}" exceeds dailyXlm "${limits.dailyXlm}"; a per-transaction limit above the daily limit is almost certainly a mistake`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

export class InvalidPolicyDefinitionError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid PolicyDefinition: ${errors.join("; ")}`);
    this.name = "InvalidPolicyDefinitionError";
  }
}

/** Throwing variant of `validatePolicyDefinitionUnits`. */
export function assertValidPolicyDefinitionUnits(definition: PolicyDefinition): void {
  const { valid, errors } = validatePolicyDefinitionUnits(definition);
  if (!valid) throw new InvalidPolicyDefinitionError(errors);
}
