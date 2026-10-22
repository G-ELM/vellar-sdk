import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVellarWallet, WalletNotReadyError } from "../../../src/client";
import type { TokenInfo } from "../../../src/balances";
import { createTrustlineGuardedPay, MissingTrustlineError } from "./trustline-guard";

beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { credentials: {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const usdc: TokenInfo = { contractId: "CUSDC", symbol: "USDC", decimals: 7 };

function build(transferImpl?: () => Promise<unknown>) {
  const kit = {
    createWallet: vi.fn(),
    connectWallet: vi.fn(async () => ({ keyIdBase64: "key123", contractId: "CWALLET" })),
    sign: vi.fn(async (tx: unknown) => tx),
    wallet: undefined,
  };
  const backend = {
    submitWalletCreation: vi.fn(),
    lookupContractId: vi.fn(async () => ({ contractId: "CWALLET", sessionId: "s" })),
    submitTransaction: vi.fn(async () => ({ hash: "txhash" })),
  };
  const transfer = vi.fn(transferImpl ?? (async () => "built-xdr"));
  const sac = { getSACClient: vi.fn(() => ({ transfer })) };
  const wallet = createVellarWallet({
    network: "testnet",
    appName: "Test App",
    kit: kit as never,
    backend: backend as never,
    sac: sac as never,
    isValidAddress: () => true,
  });
  return { wallet, kit, backend, sac, transfer };
}

describe("createTrustlineGuardedPay", () => {
  it("rejects with MissingTrustlineError before simulation or any passkey prompt", async () => {
    const { wallet, kit, backend, sac, transfer } = build();
    await wallet.connect();
    const hasTrustline = vi.fn(async () => false);
    const pay = createTrustlineGuardedPay(wallet, hasTrustline);

    const attempt = pay({ to: "CDEST", amount: 5n, token: usdc });
    await expect(attempt).rejects.toBeInstanceOf(MissingTrustlineError);
    await expect(attempt).rejects.toThrow(/no trustline for USDC \(CUSDC\)/);

    expect(hasTrustline).toHaveBeenCalledWith("CWALLET", usdc);
    expect(sac.getSACClient).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
    expect(kit.sign).not.toHaveBeenCalled();
    expect(backend.submitTransaction).not.toHaveBeenCalled();
  });

  it("is distinguishable from a generic simulation failure", async () => {
    const { wallet } = build(async () => {
      throw new Error("simulation failed");
    });
    await wallet.connect();
    const pay = createTrustlineGuardedPay(wallet, async () => true);

    const err = await pay({ to: "CDEST", amount: 5n, token: usdc }).catch((e) => e);
    expect(err).not.toBeInstanceOf(MissingTrustlineError);
    expect(err.message).toBe("simulation failed");
  });

  it("pays normally when the trustline exists", async () => {
    const { wallet, kit } = build();
    await wallet.connect();
    const pay = createTrustlineGuardedPay(wallet, async () => true);

    await expect(pay({ to: "CDEST", amount: 5n, token: usdc })).resolves.toEqual({
      hash: "txhash",
    });
    expect(kit.sign).toHaveBeenCalledOnce();
  });

  it("throws WalletNotReadyError before consulting the check when not connected", async () => {
    const { wallet } = build();
    const hasTrustline = vi.fn(async () => false);
    const pay = createTrustlineGuardedPay(wallet, hasTrustline);

    await expect(pay({ to: "CDEST", amount: 5n, token: usdc })).rejects.toBeInstanceOf(
      WalletNotReadyError,
    );
    expect(hasTrustline).not.toHaveBeenCalled();
  });
});
