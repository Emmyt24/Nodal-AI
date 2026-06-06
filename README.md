# Stellar PayFi Agent Kit

Modular, production-ready Agent Kit for autonomous payment-finance flows on the Stellar Network.

## Architecture

```
/
├── backend/                  # Agent orchestration (TypeScript)
│   ├── config.ts             # Validated env config (Zod)
│   ├── rpc_client.ts         # Horizon + Soroban RPC with retry
│   ├── agent.ts              # PayFiAgent orchestrator
│   └── tools/
│       ├── StellarPaymentTool.ts   # Native / asset payments
│       ├── SorobanInvokeTool.ts    # Smart contract invocation
│       └── X402PaymentTool.ts      # x402 machine-to-machine PayFi
│
├── contracts/                # Soroban smart contracts (Rust)
│   └── escrow/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs        # Escrow contract logic
│           └── test.rs       # Soroban unit tests
│
└── tests/                    # E2E & integration tests (Vitest)
    ├── payment.test.ts
    ├── soroban_invoke.test.ts
    └── x402.test.ts
```

## Quick Start

```bash
cp .env.example .env
# Fill in AGENT_SECRET_KEY, HORIZON_URL, SOROBAN_RPC_URL

npm install
npm run build
npm run test
```

## Running Contract Tests

```bash
cd contracts/escrow
cargo test
```

## Security

- Secrets are never hardcoded — always loaded from env / secrets manager
- Every Soroban transaction is simulated via `prepareSorobanTx` before broadcast
- x402 challenges are validated (expiry, schema) before any payment is triggered
- Retry logic with exponential back-off on all RPC calls
