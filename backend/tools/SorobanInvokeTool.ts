/**
 * backend/tools/SorobanInvokeTool.ts
 * Standalone tool: invoke any Soroban smart contract function.
 *
 * MANDATORY simulation step enforced before any broadcast.
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Contract,
  BASE_FEE,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { z } from "zod";
import { config } from "../config";
import { loadAccount, prepareSorobanTx, sorobanServer } from "../rpc_client";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const SorobanInvokeInputSchema = z.object({
  contractId: z.string().length(56, "Invalid Stellar contract ID"),
  method: z.string().min(1),
  /** Raw ScVal arguments — callers build these with stellar-sdk helpers */
  args: z.array(z.instanceof(xdr.ScVal)).default([]),
  simulateOnly: z.boolean().default(false),
});

export type SorobanInvokeInput = z.infer<typeof SorobanInvokeInputSchema>;

// ─── Tool implementation ──────────────────────────────────────────────────────

export class SorobanInvokeTool {
  private keypair: Keypair;
  private networkPassphrase: string;

  constructor(secretKey: string = config.AGENT_SECRET_KEY) {
    this.keypair = Keypair.fromSecret(secretKey);
    this.networkPassphrase =
      config.STELLAR_NETWORK === "mainnet"
        ? Networks.PUBLIC
        : config.STELLAR_NETWORK === "futurenet"
        ? Networks.FUTURENET
        : Networks.TESTNET;
  }

  /**
   * Invoke a Soroban contract function.
   * Always simulates first — set simulateOnly=true to dry-run.
   */
  async execute(
    rawInput: unknown
  ): Promise<{ txHash?: string; simulationResult?: unknown }> {
    const input = SorobanInvokeInputSchema.parse(rawInput);

    // 1. Resolve contract
    const contract = new Contract(input.contractId);

    // 2. Load source account
    const sourceAccount = await loadAccount(this.keypair.publicKey());

    // 3. Build invocation transaction
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(input.method, ...input.args))
      .setTimeout(30)
      .build();

    console.log(`🔍 [SorobanInvokeTool] Simulating ${input.method} on ${input.contractId}...`);

    // 4. MANDATORY simulate step — throws on simulation failure
    const preparedTx = await prepareSorobanTx(tx);

    if (input.simulateOnly) {
      console.log(`✅ [SorobanInvokeTool] Simulation passed (dry-run, not broadcasting).`);
      return { simulationResult: preparedTx };
    }

    // 5. Sign prepared transaction
    preparedTx.sign(this.keypair);

    // 6. Submit
    const result = await sorobanServer.sendTransaction(preparedTx);

    if (result.status === "ERROR") {
      throw new Error(`Soroban submit failed: ${result.errorResult?.toXDR("base64")}`);
    }

    // 7. Poll for confirmation
    const confirmed = await this.pollForConfirmation(result.hash);
    return { txHash: confirmed.txHash };
  }

  /** Poll Soroban RPC until transaction is confirmed or fails */
  private async pollForConfirmation(
    hash: string,
    maxAttempts = 10,
    intervalMs = 2000
  ): Promise<{ txHash: string }> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const status = await sorobanServer.getTransaction(hash);

      if (status.status === "SUCCESS") {
        console.log(`✅ [SorobanInvokeTool] Transaction confirmed: ${hash}`);
        return { txHash: hash };
      }
      if (status.status === "FAILED") {
        throw new Error(`Soroban transaction failed on-chain: ${hash}`);
      }
      console.log(`⏳ [SorobanInvokeTool] Polling... attempt ${i + 1}/${maxAttempts}`);
    }
    throw new Error(`Soroban transaction not confirmed within polling window: ${hash}`);
  }
}
