# ─────────────────────────────────────────────────────────────────────────────
# Nodal AI — Unified Test Runner
# Usage:
#   make test          → run all tests (Rust + TypeScript)
#   make test-ts       → Vitest only
#   make test-rust     → cargo test only
#   make test-coverage → Vitest with coverage report
#   make build         → TypeScript compile check
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: test test-ts test-rust test-coverage build clean

# Run both Rust and TypeScript test suites
test: test-rust test-ts

# TypeScript / Vitest tests
test-ts:
	@echo "──────────────────────────────────────────"
	@echo "▶  Running Vitest (TypeScript) tests..."
	@echo "──────────────────────────────────────────"
	npm run test:ts

# Soroban / Rust contract tests
test-rust:
	@echo "──────────────────────────────────────────"
	@echo "▶  Running Soroban (Rust) contract tests..."
	@echo "──────────────────────────────────────────"
	cargo test --manifest-path contracts/escrow/Cargo.toml -- --nocapture

# TypeScript tests with coverage
test-coverage:
	@echo "──────────────────────────────────────────"
	@echo "▶  Running Vitest with coverage..."
	@echo "──────────────────────────────────────────"
	npm run test:ts:coverage

# TypeScript compile check
build:
	@echo "▶  Compiling TypeScript..."
	npm run build

# Remove build artefacts
clean:
	@echo "▶  Cleaning dist/ and coverage/..."
	rm -rf dist coverage
	cargo clean --manifest-path contracts/escrow/Cargo.toml
