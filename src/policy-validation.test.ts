import { describe, expect, it } from "vitest";
import {
  assertValidPolicyDefinitionUnits,
  InvalidPolicyDefinitionError,
  validatePolicyDefinitionUnits,
} from "./policy-validation";
import type { PolicyDefinition } from "./types";

function def(spendingLimits?: { dailyXlm?: string; perTxXlm?: string }): PolicyDefinition {
  return { version: "1", type: "spending-limit", owners: ["GOWNER"], spendingLimits };
}

describe("validatePolicyDefinitionUnits", () => {
  it.each([
    [{ dailyXlm: "100", perTxXlm: "10" }],
    [{ dailyXlm: "100.5", perTxXlm: "100.5" }],
    [{ dailyXlm: "0", perTxXlm: "0" }],
    [{ dailyXlm: "0.0000001" }],
    [{ perTxXlm: "25" }],
    [{}],
    [undefined],
  ])("accepts %j", (limits) => {
    expect(validatePolicyDefinitionUnits(def(limits))).toEqual({ valid: true, errors: [] });
  });

  it.each([[""], ["abc"], ["-5"], ["1e7"], ["1,5"], [".5"], ["1.2.3"], ["1.00000001"]])(
    "rejects non-numeric / malformed value %j",
    (value) => {
      const result = validatePolicyDefinitionUnits(def({ dailyXlm: value }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/spendingLimits\.dailyXlm .* not a valid non-negative decimal XLM amount/);
    },
  );

  it("rejects perTxXlm greater than dailyXlm", () => {
    const result = validatePolicyDefinitionUnits(def({ dailyXlm: "10", perTxXlm: "10.0000001" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/perTxXlm .* exceeds dailyXlm/);
  });

  it("allows perTxXlm equal to dailyXlm", () => {
    expect(validatePolicyDefinitionUnits(def({ dailyXlm: "10", perTxXlm: "10.0" })).valid).toBe(true);
  });

  // Heuristic: a whole-number string whose value exceeds the total XLM supply
  // (~50 billion) cannot be a real XLM limit and is flagged as probable stroops.
  it("flags a stroop-looking large integer string as suspicious", () => {
    const result = validatePolicyDefinitionUnits(def({ dailyXlm: "100000000000000" })); // 1M XLM in stroops
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/looks like a stroop amount/);
  });

  it("does not flag a large but plausible XLM integer", () => {
    expect(validatePolicyDefinitionUnits(def({ dailyXlm: "50000000000" })).valid).toBe(true);
    expect(validatePolicyDefinitionUnits(def({ dailyXlm: "50000000001" })).valid).toBe(false);
  });

  it("does not flag a large value written with a decimal point", () => {
    expect(validatePolicyDefinitionUnits(def({ dailyXlm: "100000000000000.0" })).valid).toBe(true);
  });

  it("reports every problem, not just the first", () => {
    const result = validatePolicyDefinitionUnits(def({ dailyXlm: "abc", perTxXlm: "100000000000000" }));
    expect(result.errors).toHaveLength(2);
  });
});

describe("assertValidPolicyDefinitionUnits", () => {
  it("does not throw for a valid definition", () => {
    expect(() => assertValidPolicyDefinitionUnits(def({ dailyXlm: "5", perTxXlm: "1" }))).not.toThrow();
  });

  it("throws InvalidPolicyDefinitionError carrying the errors", () => {
    try {
      assertValidPolicyDefinitionUnits(def({ dailyXlm: "1", perTxXlm: "2" }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPolicyDefinitionError);
      expect((err as InvalidPolicyDefinitionError).errors).toHaveLength(1);
    }
  });
});
