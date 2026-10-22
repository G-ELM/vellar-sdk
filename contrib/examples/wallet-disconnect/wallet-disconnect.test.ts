import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVellarWallet, WalletNotReadyError } from "../../../src/client";
import type { TokenInfo } from "../../../src/balances";
import { withDisconnect } from "./wallet-disconnect";

beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { credentials: {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const token: TokenInfo = { contractId: "CTOKEN", symbol: "XLM", decimals: 7 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function build() {
  const kit = {
    createWallet: vi.fn(async () => ({ keyIdBase64: "key123", contractId: "CWALLET", signedTx: "x" })),
    connectWallet: vi.fn(async () => ({ keyIdBase64: "key123", contractId: "CWALLET" })),
    sign: vi.fn(async (tx: unknown) => tx),
    wallet: undefined,
  };
  const backend = {
    submitWalletCreation: vi.fn(async () => ({ sessionId: "sess-1" })),
    lookupContractId: vi.fn(async () => ({ contractId: "CWALLET", sessionId: "sess-2" })),
    submitTransaction: vi.fn(async () => ({ hash: "txhash-abc" })),
  };
  const transfer = vi.fn(async () => "built-transfer-xdr");
  const sac = { getSACClient: vi.fn(() => ({ transfer })) };
  const wallet = withDisconnect(
    createVellarWallet({
      network: "testnet",
      appName: "Test App",
      kit: kit as never,
      backend: backend as never,
      sac: sac as never,
      isValidAddress: () => true,
    }),
  );
  return { wallet, kit, backend, transfer };
}

describe("withDisconnect", () => {
  it("clears the session without touching the kit, backend, or chain", async () => {
    const { wallet, kit, backend } = build();
    await wallet.connect();
    kit.sign.mockClear();

    wallet.disconnect();

    expect(wallet.session).toBeNull();
    expect(kit.sign).not.toHaveBeenCalled();
    expect(backend.submitTransaction).not.toHaveBeenCalled();
  });

  it("is a safe no-op before connect and when called twice", () => {
    const { wallet } = build();
    expect(() => {
      wallet.disconnect();
      wallet.disconnect();
    }).not.toThrow();
    expect(wallet.session).toBeNull();
  });

  it("pay() after disconnect throws WalletNotReadyError", async () => {
    const { wallet, kit } = build();
    await wallet.connect();
    wallet.disconnect();
    await expect(wallet.pay({ to: "CDEST", amount: 5n, token })).rejects.toBeInstanceOf(
      WalletNotReadyError,
    );
    expect(kit.sign).not.toHaveBeenCalled();
  });

  it("connect() re-enables the wrapper", async () => {
    const { wallet } = build();
    await wallet.connect();
    wallet.disconnect();
    await wallet.connect();
    expect(wallet.session).not.toBeNull();
    await expect(wallet.pay({ to: "CDEST", amount: 5n, token })).resolves.toEqual({
      hash: "txhash-abc",
    });
  });

  it("an in-flight pay awaiting the passkey prompt still completes and returns its hash", async () => {
    const { wallet, kit, backend } = build();
    await wallet.connect();

    const prompt = deferred<unknown>();
    kit.sign.mockImplementationOnce(() => prompt.promise);

    const inFlight = wallet.pay({ to: "CDEST", amount: 5n, token });
    await vi.waitFor(() => expect(kit.sign).toHaveBeenCalledOnce());
    expect(wallet.pendingPayments).toBe(1);

    wallet.disconnect();
    expect(wallet.session).toBeNull();

    prompt.resolve("signed-xdr");
    await expect(inFlight).resolves.toEqual({ hash: "txhash-abc" });
    expect(backend.submitTransaction).toHaveBeenCalledOnce();
    expect(wallet.pendingPayments).toBe(0);
  });

  it("an in-flight pay disconnected during build/simulation still completes", async () => {
    const { wallet, transfer, backend } = build();
    await wallet.connect();

    const built = deferred<string>();
    transfer.mockImplementationOnce(() => built.promise);

    const inFlight = wallet.pay({ to: "CDEST", amount: 5n, token });
    await vi.waitFor(() => expect(transfer).toHaveBeenCalledOnce());

    wallet.disconnect();
    built.resolve("built-transfer-xdr");

    await expect(inFlight).resolves.toEqual({ hash: "txhash-abc" });
    expect(backend.submitTransaction).toHaveBeenCalledOnce();
  });

  it("an in-flight pay that fails surfaces its own error and releases the pending count", async () => {
    const { wallet, kit } = build();
    await wallet.connect();

    const prompt = deferred<unknown>();
    kit.sign.mockImplementationOnce(() => prompt.promise);

    const inFlight = wallet.pay({ to: "CDEST", amount: 5n, token });
    await vi.waitFor(() => expect(kit.sign).toHaveBeenCalledOnce());

    wallet.disconnect();
    prompt.reject(new Error("user cancelled passkey"));

    await expect(inFlight).rejects.toThrow("user cancelled passkey");
    expect(wallet.pendingPayments).toBe(0);
  });
});
