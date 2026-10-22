import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVellarWallet } from "../../../src/client";
import { WalletNetworkMismatchError } from "../../../src/passkeykit-connector";
import type { Network } from "../../../src/types";

beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { credentials: {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function build(network: Network) {
  const kit = {
    createWallet: vi.fn(async () => ({ keyIdBase64: "key123", contractId: "CWALLET", signedTx: "x" })),
    connectWallet: vi.fn(async () => ({ keyIdBase64: "key123", contractId: "CWALLET" })),
    sign: vi.fn(async (tx: unknown) => tx),
    wallet: undefined,
  };
  const backend = {
    submitWalletCreation: vi.fn(async () => ({ sessionId: "sess-1" })),
    lookupContractId: vi.fn(async () => ({ contractId: "CWALLET", sessionId: "sess-2" })),
    submitTransaction: vi.fn(async () => ({ hash: "h" })),
  };
  const wallet = createVellarWallet({
    network,
    appName: "Test App",
    kit: kit as never,
    backend: backend as never,
    sac: { getSACClient: vi.fn() } as never,
    isValidAddress: () => true,
  });
  return { wallet, kit, backend };
}

describe("CreateWalletInput network consistency", () => {
  it("rejects a conflicting network before any passkey prompt or RPC call", async () => {
    const { wallet, kit, backend } = build("testnet");

    const attempt = wallet.connector.createWallet({ network: "mainnet", username: "alice" });
    await expect(attempt).rejects.toBeInstanceOf(WalletNetworkMismatchError);
    await expect(attempt).rejects.toMatchObject({ name: "WalletNetworkMismatchError" });

    expect(kit.createWallet).not.toHaveBeenCalled();
    expect(backend.submitWalletCreation).not.toHaveBeenCalled();
    expect(wallet.session).toBeNull();
  });

  it("names both the configured network and the conflicting value", async () => {
    const { wallet } = build("testnet");
    await expect(wallet.connector.createWallet({ network: "mainnet" })).rejects.toThrow(
      /testnet.*mainnet/,
    );
  });

  it("accepts an input network equal to the configured one", async () => {
    const { wallet, kit } = build("mainnet");
    const session = await wallet.connector.createWallet({ network: "mainnet", username: "bob" });
    expect(session.network).toBe("mainnet");
    expect(kit.createWallet).toHaveBeenCalledWith("Test App", "bob");
  });

  it("wallet.create() always uses the configured network", async () => {
    const { wallet } = build("mainnet");
    const session = await wallet.create({ username: "carol" });
    expect(session.network).toBe("mainnet");
  });
});
