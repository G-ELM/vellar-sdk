import { WalletNotReadyError, type PayInput, type VellarWallet } from "../../../src/client";
import type { TokenInfo } from "../../../src/balances";

// wallet.pay() has no trustline check: a missing trustline only surfaces as a
// generic simulation failure. This wrapper runs a caller-supplied check BEFORE
// wallet.pay() — so before simulation and before any passkey prompt — and
// throws a distinct, named MissingTrustlineError.

export class MissingTrustlineError extends Error {
  constructor(
    readonly account: string,
    readonly token: TokenInfo,
  ) {
    super(
      `Account ${account} has no trustline for ${token.symbol} (${token.contractId}); ` +
        "establish the trustline before paying in this asset",
    );
    this.name = "MissingTrustlineError";
  }
}

export type HasTrustline = (account: string, token: TokenInfo) => Promise<boolean>;

/** Returns a `pay` that rejects with MissingTrustlineError when the check returns false. */
export function createTrustlineGuardedPay(
  wallet: Pick<VellarWallet, "session" | "pay">,
  hasTrustline: HasTrustline,
): (input: PayInput) => Promise<{ hash: string }> {
  return async (input) => {
    const session = wallet.session;
    if (!session) {
      throw new WalletNotReadyError("Call create() or connect() before pay()");
    }
    if (!(await hasTrustline(session.accountId, input.token))) {
      throw new MissingTrustlineError(session.accountId, input.token);
    }
    return wallet.pay(input);
  };
}
