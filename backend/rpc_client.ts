/**
 * backend/rpc_client.ts
 * Thin wrapper around Horizon + Soroban RPC with retry logic.
 * All network calls route through here — centralised observability point.
 */

import {
  Horizon,
  SorobanRpc,
  Transaction,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import { ZodError } from "zod";
import { config } from "./config";

// ─── Exponential back-off retry ─────────────────────────────────────────────

/**
 * Returns false for deterministic failures (ZodError, TypeError) that will
 * never succeed on retry, true for transient errors worth retrying.
 */
export function DEFAULT_IS_RETRYABLE(err: unknown): boolean {
  if (err instanceof ZodError) return false;
  if (err instanceof TypeError) return false;
  return true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = config.MAX_RETRIES,
  delayMs = config.RETRY_DELAY_MS,
  isRetryable: (err: unknown) => boolean = DEFAULT_IS_RETRYABLE
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) {
        throw err;
      }
      lastErr = err;
      console.warn(`⚠️  Attempt ${attempt}/${retries} failed:`, (err as Error).message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt)); // exponential back-off
      }
    }
  }
  throw lastErr;
}

// ─── Horizon client ──────────────────────────────────────────────────────────

export const horizonServer = new Horizon.Server(config.HORIZON_URL, {
  allowHttp: config.STELLAR_NETWORK !== "mainnet",
});

export async function loadAccount(publicKey: string) {
  return withRetry(() => horizonServer.loadAccount(publicKey), config.MAX_RETRIES, config.RETRY_DELAY_MS, DEFAULT_IS_RETRYABLE);
}

export async function submitTransaction(tx: Transaction | FeeBumpTransaction) {
  return withRetry(() => horizonServer.submitTransaction(tx), config.MAX_RETRIES, config.RETRY_DELAY_MS, DEFAULT_IS_RETRYABLE);
}

// ─── Soroban RPC client ───────────────────────────────────────────────────────

export const sorobanServer = new SorobanRpc.Server(config.SOROBAN_RPC_URL, {
  allowHttp: config.STELLAR_NETWORK !== "mainnet",
});

/**
 * Simulate a Soroban transaction BEFORE broadcasting.
 * Returns the simulation result — callers MUST check for errors.
 */
export async function simulateSorobanTx(tx: Transaction) {
  return withRetry(() => sorobanServer.simulateTransaction(tx), config.MAX_RETRIES, config.RETRY_DELAY_MS, DEFAULT_IS_RETRYABLE);
}

/**
 * Prepare (simulate + assemble) a Soroban transaction.
 * Throws if simulation indicates failure — safe guard before broadcast.
 */
export async function prepareSorobanTx(tx: Transaction): Promise<Transaction> {
  const simResult = await simulateSorobanTx(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  return SorobanRpc.assembleTransaction(tx, simResult).build();
}
