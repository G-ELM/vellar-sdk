import { WalletNotReadyError, type PayInput, type VellarWallet } from "../../../src/client";
import type { WalletSession } from "../../../src/types";

// `VellarWallet` has no disconnect(). This wrapper adds one without touching
// src/: it clears the local session view only — no passkey prompt, no RPC,
// nothing on-chain. An in-flight pay() is NOT aborted (a passkey prompt can't
// be cancelled from here); it runs to completion and resolves/rejects with its
// own result, so a payment is never silently lost. pay() calls started after
// disconnect() throw WalletNotReadyError.

export interface DisconnectableWallet {
  /** The current session, or null before connect/create or after disconnect(). */
  readonly session: VellarWallet["session"];
  /** Number of pay() calls still in flight. */
  readonly pendingPayments: number;
  disconnect(): void;
  /** Delegates to wallet.create() and re-enables the wrapper. */
  create(input?: { username?: string }): Promise<WalletSession>;
  /** Delegates to wallet.connect() and re-enables the wrapper. */
  connect(): Promise<WalletSession>;
  pay(input: PayInput): Promise<{ hash: string }>;
  readonly wallet: VellarWallet;
}

export function withDisconnect(wallet: VellarWallet): DisconnectableWallet {
  let disconnected = false;
  let pending = 0;

  return {
    wallet,
    get session() {
      return disconnected ? null : wallet.session;
    },
    get pendingPayments() {
      return pending;
    },
    disconnect() {
      disconnected = true;
    },
    async create(input) {
      const session = await wallet.create(input);
      disconnected = false;
      return session;
    },
    async connect() {
      const session = await wallet.connect();
      disconnected = false;
      return session;
    },
    async pay(input) {
      if (disconnected) {
        throw new WalletNotReadyError("Wallet is disconnected; call connect() or create() before pay()");
      }
      pending++;
      try {
        return await wallet.pay(input);
      } finally {
        pending--;
      }
    },
  };
}
