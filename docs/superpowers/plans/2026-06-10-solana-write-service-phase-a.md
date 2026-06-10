# Solana Write Service — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carve a standalone Solana on-chain *write* service out of the Express backend that mints **Bubblegum V2 compressed NFTs** into an MPL-Core collection with enforced royalties, exposes `POST /mint` and `POST /anchor-listing` behind fail-closed shared-secret auth, and ships a parameterized `setup-tree` / `setup-collection` ops CLI — all proven by Jest tests against umi's own builders plus a skippable devnet round-trip.

**Architecture:** The service IS the reduced `backend/` (per spec Phase D). It keeps the existing Express + `serverless-http` Lambda shape. New high-risk Solana code is written in **TypeScript** (`src/solana/*.ts`, `src/middleware/*.ts`, `src/http/*.ts`) for SDK type-safety; stable carried-over helpers (`evidence-locker-client.js`, `verification.js` PDA/ix builders) stay JS and are imported via `allowJs`. The server wallet key single-homes here.

**Tech Stack:** Node ESM, TypeScript, Express 4, `serverless-http`, Jest + ts-jest, `@metaplex-foundation/umi` 1.4.x, `@metaplex-foundation/mpl-bubblegum` 5.0.2 (V2 instructions), `@metaplex-foundation/mpl-core` (NEW dep), `@solana/web3.js`, `bs58`.

**Spec:** `docs/superpowers/specs/2026-06-08-fastapi-cnft-minting-design.md` (V2 addendum).

**Working directory:** the `worktree-decommission-express` worktree. All paths below are relative to `backend/`.

**Decisions locked (from spec review):** royalty `basisPoints=500` (5%); royalty recipient = server/creator wallet (`umi.identity`); ruleSet = `ProgramAllowList`; devnet tree `depth=14 buffer=64 canopy=11`.

---

## File Structure

| File | Responsibility | New/Carried |
|---|---|---|
| `package.json` | add `@metaplex-foundation/mpl-core`, ts-jest, test scripts | Modify |
| `tsconfig.json` | `allowJs`, `esModuleInterop`, NodeNext, `outDir dist` | Modify |
| `jest.config.js` | ts-jest ESM preset | Create |
| `src/solana/umi.ts` | umi factory + server-keypair loader (single home) | Create |
| `src/solana/cnft.ts` | `mintCompressedNFTV2` (mintV2 → coreCollection) | Create |
| `src/solana/collection.ts` | `createRoyaltyCollection` (MPL-Core + Royalties + AllowList + BubblegumV2 plugin) | Create |
| `src/solana/tree.ts` | `createMerkleTreeV2` (createTreeV2 + canopy) | Create |
| `src/solana/standard-nft.ts` | `mintStandardNFT` (carried from `solana.js`) | Create (port) |
| `src/middleware/auth.ts` | fail-closed shared-secret middleware | Create |
| `src/http/mint.ts` | `POST /mint` handler | Create |
| `src/http/anchor-listing.ts` | `POST /anchor-listing` orchestrator (mint→verify→list, best-effort) | Create |
| `src/app.ts` | express app wiring (helmet, json, auth, routes) | Create |
| `src/lambda.ts` | `serverless-http` Lambda handler | Modify (reduce) |
| `src/dev.ts` | local `app.listen` entry | Modify (reduce) |
| `scripts/setup-merkle-tree.js` | CLI: `--depth/--buffer/--canopy` → `createMerkleTreeV2` | Modify |
| `scripts/setup-collection.js` | CLI: create the royalty collection, print address | Create |
| `src/services/evidence-locker-client.js` | `buildListEvidenceIx`, `findListingPda` | Carried as-is |
| `src/services/verification.js` | `submitVerification` ix builders | Carried as-is |
| `tests/*` | unit + skippable devnet integration | Create |

Files DELETED in Phase A's carve (after their logic is ported/kept): none yet — deletion of the redundant Express API surface is **Phase D**, not here. Phase A only *adds* the service modules and reduces the entry points to route to them. `compressed-nft.js` (v1) is superseded by `src/solana/cnft.ts` + `src/solana/tree.ts`; leave the old file in place until Phase B wiring is green, then delete in its own task (Task 14).

---

## Task 1: Add mpl-core + test tooling

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add dependency and dev tooling**

Edit `package.json` `dependencies` (add):
```json
"@metaplex-foundation/mpl-core": "^1.4.0",
```
Edit `devDependencies` (add):
```json
"ts-jest": "^29.2.5",
"@jest/globals": "^29.7.0",
"jest": "^29.7.0",
"ts-node": "^10.9.2"
```
Edit `scripts` (replace `test`, add):
```json
"test": "NODE_OPTIONS=--experimental-vm-modules jest",
"test:devnet": "NODE_OPTIONS=--experimental-vm-modules RUN_DEVNET=1 jest devnet",
"setup-tree": "node scripts/setup-merkle-tree.js",
"setup-collection": "node scripts/setup-collection.js"
```

- [ ] **Step 2: Install**

Run: `cd backend && bun install` (repo uses `bun.lock`).
Expected: lockfile updates, `node_modules/@metaplex-foundation/mpl-core` exists.

- [ ] **Step 3: Confirm mpl-core API names match the plan**

Run: `grep -rhoE "export (declare )?(const|function) (createCollection|ruleSet)\b" node_modules/@metaplex-foundation/mpl-core/dist/src/**/*.d.ts | sort -u`
Expected: shows `createCollection` and `ruleSet`. Also run:
`grep -rl "BubblegumV2" node_modules/@metaplex-foundation/mpl-core/dist | head`
Expected: at least one match (confirms the `BubblegumV2` collection-plugin type exists). If the plugin type name differs, note the exact name — it is used verbatim in Task 5.

- [ ] **Step 4: Commit**
```bash
git add backend/package.json backend/bun.lock
git commit -m "build(write-service): add mpl-core + ts-jest tooling"
```

---

## Task 2: TypeScript + Jest config

**Files:**
- Modify: `backend/tsconfig.json`
- Create: `backend/jest.config.js`

- [ ] **Step 1: Set tsconfig for NodeNext ESM + allowJs**

Write `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "scripts/**/*", "tests/**/*"]
}
```

- [ ] **Step 2: Create jest.config.js (ESM + ts-jest)**

Write `backend/jest.config.js`:
```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: { allowJs: true } }],
  },
  testMatch: ['**/tests/**/*.test.ts'],
};
```

- [ ] **Step 3: Smoke test the harness**

Write `backend/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from '@jest/globals';
describe('harness', () => {
  it('runs typescript tests', () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 4: Run it**

Run: `cd backend && npm test -- smoke`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**
```bash
git add backend/tsconfig.json backend/jest.config.js backend/tests/smoke.test.ts
git commit -m "build(write-service): ts-jest ESM harness"
```

---

## Task 3: Fail-closed shared-secret auth middleware

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Test: `backend/tests/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Write `backend/tests/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { sharedSecretAuth } from '../src/middleware/auth.js';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res as Response;
}
function reqWith(auth?: string) {
  return { header: (k: string) => (k.toLowerCase() === 'authorization' ? auth : undefined) } as unknown as Request;
}

describe('sharedSecretAuth (fail-closed)', () => {
  beforeEach(() => { delete process.env.HACKNYU_MINT_SERVICE_SECRET; });

  it('401s when the secret env is unset (fail closed)', () => {
    const res = mockRes(); const next = jest.fn();
    sharedSecretAuth(reqWith('Bearer whatever'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s on missing or wrong header', () => {
    process.env.HACKNYU_MINT_SERVICE_SECRET = 's3cret';
    const res = mockRes(); const next = jest.fn();
    sharedSecretAuth(reqWith(undefined), res, next);
    sharedSecretAuth(reqWith('Bearer nope'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() on correct bearer secret', () => {
    process.env.HACKNYU_MINT_SERVICE_SECRET = 's3cret';
    const res = mockRes(); const next = jest.fn();
    sharedSecretAuth(reqWith('Bearer s3cret'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- auth`
Expected: FAIL — cannot find module `../src/middleware/auth.js`.

- [ ] **Step 3: Implement the middleware**

Write `backend/src/middleware/auth.ts`:
```ts
import type { Request, Response, NextFunction } from 'express';

/**
 * Fail-closed shared-secret gate. If HACKNYU_MINT_SERVICE_SECRET is unset,
 * EVERY request is rejected (401) — an unconfigured secret must never mean
 * "open". Mirrors the Helius-webhook-secret posture in the FastAPI backend.
 */
export function sharedSecretAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.HACKNYU_MINT_SERVICE_SECRET;
  if (!expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const provided = req.header('authorization');
  if (!provided || provided !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- auth`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add backend/src/middleware/auth.ts backend/tests/auth.test.ts
git commit -m "feat(write-service): fail-closed shared-secret auth middleware"
```

---

## Task 4: umi factory + single-homed server keypair

**Files:**
- Create: `backend/src/solana/umi.ts`
- Test: `backend/tests/umi.test.ts`

- [ ] **Step 1: Write the failing test**

Write `backend/tests/umi.test.ts`:
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getServerKeypairBytes, createServerUmi } from '../src/solana/umi.js';

describe('umi server identity', () => {
  beforeEach(() => { delete process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY; });

  it('throws a clear error when the server key env is unset', () => {
    expect(() => getServerKeypairBytes()).toThrow('HACKNYU_SERVER_WALLET_PRIVATE_KEY');
  });

  it('loads the umi identity from the bs58 server key', () => {
    const kp = Keypair.generate();
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = bs58.encode(kp.secretKey);
    const umi = createServerUmi();
    expect(umi.identity.publicKey.toString()).toBe(kp.publicKey.toBase58());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- umi`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the umi factory**

Write `backend/src/solana/umi.ts`:
```ts
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, type Umi } from '@metaplex-foundation/umi';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { mplCore } from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';

const RPC_URL = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/** The single home of the server wallet secret. bs58-encoded, like the old Express services. */
export function getServerKeypairBytes(): Uint8Array {
  const pk = process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY;
  if (!pk) throw new Error('HACKNYU_SERVER_WALLET_PRIVATE_KEY is not set in environment variables');
  return bs58.decode(pk);
}

/** A umi instance with both Bubblegum (V2) and Core plugins and the server identity set. */
export function createServerUmi(): Umi {
  const umi = createUmi(RPC_URL).use(mplBubblegum()).use(mplCore());
  const keypair = umi.eddsa.createKeypairFromSecretKey(getServerKeypairBytes());
  umi.use(keypairIdentity(keypair));
  return umi;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- umi`
Expected: PASS (2 tests). (No network: `createUmi` + `keypairIdentity` are local.)

- [ ] **Step 5: Commit**
```bash
git add backend/src/solana/umi.ts backend/tests/umi.test.ts
git commit -m "feat(write-service): umi factory with single-homed server keypair"
```

---

## Task 5: MPL-Core royalty collection provisioning

**Files:**
- Create: `backend/src/solana/collection.ts`
- Test: `backend/tests/collection.test.ts`

- [ ] **Step 1: Write the failing test (instruction builds without throwing)**

The collection create is a network op, so the unit test asserts the **builder constructs** with the right plugin shape (umi validates plugin types at build time). Write `backend/tests/collection.test.ts`:
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildRoyaltyCollectionTx } from '../src/solana/collection.js';

describe('royalty collection builder', () => {
  beforeEach(() => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey);
  });

  it('builds a createCollection tx with BubblegumV2 + Royalties(AllowList) plugins', () => {
    const { builder, collection } = buildRoyaltyCollectionTx({
      name: 'HypeChain Provenance',
      uri: 'https://example.com/collection.json',
      royaltyBasisPoints: 500,
      allowListPrograms: [Keypair.generate().publicKey.toBase58()],
    });
    // Builder is constructed (would throw on an invalid plugin type/shape).
    expect(builder.items.length).toBeGreaterThan(0);
    expect(typeof collection).toBe('string');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- collection`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement collection provisioning**

Write `backend/src/solana/collection.ts`:
```ts
import { createCollection, ruleSet } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey, type TransactionBuilder } from '@metaplex-foundation/umi';
import bs58 from 'bs58';
import { createServerUmi } from './umi.js';

export interface CreateCollectionParams {
  name: string;
  uri: string;
  royaltyBasisPoints?: number;   // default 500 (5%)
  royaltyRecipient?: string;     // default: server identity
  allowListPrograms?: string[];  // ProgramAllowList contents (base58 program ids)
}

/**
 * Build (don't send) the createCollection tx. Returns the builder + the
 * generated collection address. Split out so it is unit-testable without RPC.
 *
 * NOTE on enforcement: ProgramAllowList means ONLY listed programs may transfer
 * the asset. An EMPTY allowlist => the asset is effectively soulbound. To enforce
 * royalties AND stay tradeable, the list must include the program(s) allowed to
 * move assets (e.g. HypeChain's own marketplace program id). Callers pass that in.
 */
export function buildRoyaltyCollectionTx(p: CreateCollectionParams): { builder: TransactionBuilder; collection: string } {
  const umi = createServerUmi();
  const collectionSigner = generateSigner(umi);
  const recipient = p.royaltyRecipient ? umiPublicKey(p.royaltyRecipient) : umi.identity.publicKey;
  const allow = (p.allowListPrograms ?? []).map(umiPublicKey);
  const builder = createCollection(umi, {
    collection: collectionSigner,
    name: p.name,
    uri: p.uri,
    plugins: [
      { type: 'BubblegumV2' }, // REQUIRED so V2 cNFTs can mint into this collection
      {
        type: 'Royalties',
        basisPoints: p.royaltyBasisPoints ?? 500,
        creators: [{ address: recipient, percentage: 100 }],
        ruleSet: ruleSet('ProgramAllowList', [allow]),
      },
    ],
  });
  return { builder, collection: collectionSigner.publicKey.toString() };
}

export async function createRoyaltyCollection(p: CreateCollectionParams): Promise<{ collection: string; signature: string }> {
  const umi = createServerUmi();
  const { builder, collection } = buildRoyaltyCollectionTx(p);
  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
  return { collection, signature: bs58.encode(signature) };
}
```
> If Task 1 Step 3 reported a plugin-type name other than `BubblegumV2`, use that exact string here.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- collection`
Expected: PASS. If it throws on the `BubblegumV2` plugin type, correct the type name per Task 1 Step 3 and re-run.

- [ ] **Step 5: Commit**
```bash
git add backend/src/solana/collection.ts backend/tests/collection.test.ts
git commit -m "feat(write-service): MPL-Core royalty collection (AllowList + BubblegumV2)"
```

---

## Task 6: Bubblegum V2 compressed-NFT mint

**Files:**
- Create: `backend/src/solana/cnft.ts`
- Test: `backend/tests/cnft.test.ts`

- [ ] **Step 1: Write the failing test (builder + name truncation)**

Write `backend/tests/cnft.test.ts`:
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildMintV2Tx } from '../src/solana/cnft.js';

describe('mintV2 builder', () => {
  beforeEach(() => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey);
  });

  it('builds a mintV2 tx into a core collection', () => {
    const { builder } = buildMintV2Tx({
      leafOwner: Keypair.generate().publicKey.toBase58(),
      metadataUri: 'https://example.com/x.json',
      name: 'A really long product name that exceeds the limit',
      merkleTree: Keypair.generate().publicKey.toBase58(),
      coreCollection: Keypair.generate().publicKey.toBase58(),
    });
    expect(builder.items.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- cnft`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the V2 mint**

Write `backend/src/solana/cnft.ts`:
```ts
import { mintV2, parseLeafFromMintV2Transaction, findLeafAssetIdPda } from '@metaplex-foundation/mpl-bubblegum';
import { publicKey as umiPublicKey, some, type TransactionBuilder } from '@metaplex-foundation/umi';
import bs58 from 'bs58';
import { createServerUmi } from './umi.js';

export interface MintCNftParams {
  leafOwner: string;
  metadataUri: string;
  name: string;
  merkleTree: string;
  coreCollection: string;
  sellerFeeBasisPoints?: number; // default 500
}
export interface MintCNftResult {
  assetId: string;
  signature: string;
  leafIndex: number;
  merkleTree: string;
}

/** Build (don't send) the mintV2 tx. Unit-testable without RPC. */
export function buildMintV2Tx(p: MintCNftParams): { builder: TransactionBuilder } {
  const umi = createServerUmi();
  const collection = umiPublicKey(p.coreCollection);
  const builder = mintV2(umi, {
    collectionAuthority: umi.identity, // server is the collection update authority
    leafOwner: umiPublicKey(p.leafOwner),
    merkleTree: umiPublicKey(p.merkleTree),
    coreCollection: collection,
    metadata: {
      name: p.name.substring(0, 32), // Metaplex 32-char limit
      uri: p.metadataUri,
      sellerFeeBasisPoints: p.sellerFeeBasisPoints ?? 500,
      collection: some(collection), // V2: pubkey, always considered verified
      creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
    },
  });
  return { builder };
}

export async function mintCompressedNFTV2(p: MintCNftParams): Promise<MintCNftResult> {
  const umi = createServerUmi();
  const { builder } = buildMintV2Tx(p);
  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  const leaf = await parseLeafFromMintV2Transaction(umi, signature);
  // findLeafAssetIdPda returns a umi Pda ([PublicKey, bump]); destructure the pubkey.
  const [assetId] = findLeafAssetIdPda(umi, {
    merkleTree: umiPublicKey(p.merkleTree),
    leafIndex: leaf.nonce,
  });

  return {
    assetId: assetId.toString(),
    signature: bs58.encode(signature),
    leafIndex: Number(leaf.nonce),
    merkleTree: p.merkleTree,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- cnft`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/solana/cnft.ts backend/tests/cnft.test.ts
git commit -m "feat(write-service): Bubblegum V2 cNFT mint into core collection"
```

---

## Task 7: V2 Merkle tree provisioning (canopy-aware)

**Files:**
- Create: `backend/src/solana/tree.ts`
- Test: `backend/tests/tree.test.ts`

- [ ] **Step 1: Write the failing test**

Write `backend/tests/tree.test.ts`:
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { capacityForDepth } from '../src/solana/tree.js';

describe('tree helpers', () => {
  beforeEach(() => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey);
  });
  it('computes capacity as 2^depth', () => {
    expect(capacityForDepth(14)).toBe(16384);
    expect(capacityForDepth(20)).toBe(1048576);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- tree`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tree provisioning with createTreeV2 + canopy**

Write `backend/src/solana/tree.ts`:
```ts
import { createTreeV2 } from '@metaplex-foundation/mpl-bubblegum';
import { generateSigner } from '@metaplex-foundation/umi';
import { createServerUmi } from './umi.js';

export function capacityForDepth(maxDepth: number): number {
  return 2 ** maxDepth;
}

export interface CreateTreeParams {
  maxDepth?: number;     // default 14 (devnet)
  maxBufferSize?: number; // default 64
  canopyDepth?: number;   // default 11
}
export interface CreateTreeResult {
  treeAddress: string;
  maxDepth: number;
  maxBufferSize: number;
  canopyDepth: number;
  capacity: number;
}

export async function createMerkleTreeV2(p: CreateTreeParams = {}): Promise<CreateTreeResult> {
  const maxDepth = p.maxDepth ?? 14;
  const maxBufferSize = p.maxBufferSize ?? 64;
  const canopyDepth = p.canopyDepth ?? 11;

  const umi = createServerUmi();
  const merkleTree = generateSigner(umi);
  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth,
    maxBufferSize,
    canopyDepth,
    public: false, // only the tree authority (this service) may mint
  });
  await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  return {
    treeAddress: merkleTree.publicKey.toString(),
    maxDepth,
    maxBufferSize,
    canopyDepth,
    capacity: capacityForDepth(maxDepth),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- tree`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/solana/tree.ts backend/tests/tree.test.ts
git commit -m "feat(write-service): V2 Merkle tree provisioning (createTreeV2 + canopy)"
```

---

## Task 8: Port standard-NFT mint (useCompressedNFT=false path)

**Files:**
- Create: `backend/src/solana/standard-nft.ts`
- Test: `backend/tests/standard-nft.test.ts`

- [ ] **Step 1: Write the failing test**

Write `backend/tests/standard-nft.test.ts`:
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildStandardNftTx } from '../src/solana/standard-nft.js';

describe('standard NFT builder', () => {
  beforeEach(() => {
    process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey);
  });
  it('builds a createNft tx and returns the mint address', () => {
    const { builder, mint } = buildStandardNftTx({
      leafOwner: Keypair.generate().publicKey.toBase58(),
      metadataUri: 'https://example.com/x.json',
      name: 'Item',
    });
    expect(builder.items.length).toBeGreaterThan(0);
    expect(typeof mint).toBe('string');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- standard-nft`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (ported from `solana.js` mintNFT, typed)**

Write `backend/src/solana/standard-nft.ts`:
```ts
import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, keypairIdentity, percentAmount, publicKey as umiPublicKey, type TransactionBuilder } from '@metaplex-foundation/umi';
import bs58 from 'bs58';
import { getServerKeypairBytes } from './umi.js';

const RPC_URL = process.env.HACKNYU_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export interface MintStandardParams { leafOwner: string; metadataUri: string; name: string; sellerFeePercent?: number; }

/** Token-Metadata umi (separate from the bubblegum/core umi to keep plugin sets minimal). */
function tokenMetadataUmi() {
  const umi = createUmi(RPC_URL).use(mplTokenMetadata());
  const kp = umi.eddsa.createKeypairFromSecretKey(getServerKeypairBytes());
  umi.use(keypairIdentity(kp));
  return umi;
}

export function buildStandardNftTx(p: MintStandardParams): { builder: TransactionBuilder; mint: string } {
  const umi = tokenMetadataUmi();
  const mint = generateSigner(umi);
  const builder = createNft(umi, {
    mint,
    name: p.name.substring(0, 32),
    uri: p.metadataUri,
    sellerFeeBasisPoints: percentAmount(p.sellerFeePercent ?? 5),
    tokenOwner: umiPublicKey(p.leafOwner),
    updateAuthority: umi.identity.publicKey,
    creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
  });
  return { builder, mint: mint.publicKey.toString() };
}

export async function mintStandardNFT(p: MintStandardParams): Promise<{ mintAddress: string; signature: string }> {
  const umi = tokenMetadataUmi();
  const { builder, mint } = buildStandardNftTx(p);
  const { signature } = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
  return { mintAddress: mint, signature: bs58.encode(signature) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- standard-nft`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/solana/standard-nft.ts backend/tests/standard-nft.test.ts
git commit -m "feat(write-service): port standard NFT mint (typed)"
```

---

## Task 9: `POST /mint` handler

**Files:**
- Create: `backend/src/http/mint.ts`
- Test: `backend/tests/http-mint.test.ts`

The handler validates the body, dispatches to `mintCompressedNFTV2` or `mintStandardNFT`, and maps to the spec response. To keep it unit-testable without RPC, the mint functions are injected.

- [ ] **Step 1: Write the failing test**

Write `backend/tests/http-mint.test.ts`:
```ts
import { describe, it, expect, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { makeMintHandler } from '../src/http/mint.js';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('POST /mint handler', () => {
  it('400s on missing required fields', async () => {
    const handler = makeMintHandler({ mintCompressed: jest.fn() as any, mintStandard: jest.fn() as any });
    const res = mockRes();
    await handler({ body: {} } as Request, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('mints compressed by default and returns the contract shape', async () => {
    const mintCompressed = jest.fn(async () => ({ assetId: 'AID', signature: 'SIG', leafIndex: 3, merkleTree: 'TREE' }));
    const handler = makeMintHandler({ mintCompressed: mintCompressed as any, mintStandard: jest.fn() as any });
    const res = mockRes();
    await handler({ body: { targetWallet: 'W', metadataUri: 'U', name: 'N', coreCollection: 'C', merkleTree: 'TREE' } } as Request, res);
    expect(mintCompressed).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ nftMintAddress: 'AID', isCompressed: true, mintSignature: 'SIG' }));
  });

  it('mints standard when useCompressedNFT=false', async () => {
    const mintStandard = jest.fn(async () => ({ mintAddress: 'MINT', signature: 'SIG2' }));
    const handler = makeMintHandler({ mintCompressed: jest.fn() as any, mintStandard: mintStandard as any });
    const res = mockRes();
    await handler({ body: { targetWallet: 'W', metadataUri: 'U', name: 'N', useCompressedNFT: false } } as Request, res);
    expect(mintStandard).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ nftMintAddress: 'MINT', isCompressed: false }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- http-mint`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler factory**

Write `backend/src/http/mint.ts`:
```ts
import type { Request, Response } from 'express';
import { mintCompressedNFTV2, type MintCNftResult } from '../solana/cnft.js';
import { mintStandardNFT } from '../solana/standard-nft.js';

export interface MintDeps {
  mintCompressed: (p: { leafOwner: string; metadataUri: string; name: string; merkleTree: string; coreCollection: string }) => Promise<MintCNftResult>;
  mintStandard: (p: { leafOwner: string; metadataUri: string; name: string }) => Promise<{ mintAddress: string; signature: string }>;
}

export function makeMintHandler(deps: MintDeps) {
  return async function mintHandler(req: Request, res: Response): Promise<void> {
    const { targetWallet, metadataUri, name, useCompressedNFT = true, merkleTree, coreCollection } = req.body ?? {};
    if (!targetWallet || !metadataUri || !name) {
      res.status(400).json({ error: 'targetWallet, metadataUri and name are required' });
      return;
    }
    try {
      if (useCompressedNFT) {
        const tree = merkleTree ?? process.env.HACKNYU_MERKLE_TREE_ADDRESS;
        const collection = coreCollection ?? process.env.HACKNYU_CORE_COLLECTION_ADDRESS;
        if (!tree || !collection) {
          res.status(400).json({ error: 'merkleTree and coreCollection (or their env defaults) are required for compressed mint' });
          return;
        }
        const r = await deps.mintCompressed({ leafOwner: targetWallet, metadataUri, name, merkleTree: tree, coreCollection: collection });
        res.json({ nftMintAddress: r.assetId, isCompressed: true, mintSignature: r.signature, leafIndex: r.leafIndex, merkleTree: r.merkleTree });
        return;
      }
      const r = await deps.mintStandard({ leafOwner: targetWallet, metadataUri, name });
      res.json({ nftMintAddress: r.mintAddress, isCompressed: false, mintSignature: r.signature });
    } catch (err) {
      // Mint is critical: surface as 502 so the caller fails the request.
      res.status(502).json({ error: 'mint_failed', detail: (err as Error).message });
    }
  };
}

/** Production handler bound to the real mint functions. */
export const mintHandler = makeMintHandler({
  mintCompressed: mintCompressedNFTV2,
  mintStandard: mintStandardNFT,
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- http-mint`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add backend/src/http/mint.ts backend/tests/http-mint.test.ts
git commit -m "feat(write-service): POST /mint handler (compressed default, standard fallback)"
```

---

## Task 10: `POST /anchor-listing` orchestrator (mint → verify → list)

**Files:**
- Create: `backend/src/http/anchor-listing.ts`
- Test: `backend/tests/http-anchor-listing.test.ts`

Mirrors Express failure semantics: **mint critical** (failure ⇒ request fails), **verify + list best-effort** (failure ⇒ null signature, request still 200). Verify/list call the carried-over JS modules; they are injected for testability.

- [ ] **Step 1: Write the failing test**

Write `backend/tests/http-anchor-listing.test.ts`:
```ts
import { describe, it, expect, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { makeAnchorListingHandler } from '../src/http/anchor-listing.js';

function mockRes() {
  const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res as Response;
}
const body = {
  targetWallet: 'W', metadataUri: 'U', name: 'N', merkleTree: 'TREE', coreCollection: 'C',
  verification: { confidenceBps: 9000, model: 'm', casePrefix: 'CP' },
  listing: { priceLamports: '1000' },
};

describe('POST /anchor-listing', () => {
  it('fails the request when the critical mint fails', async () => {
    const handler = makeAnchorListingHandler({
      mintCompressed: jest.fn(async () => { throw new Error('rpc down'); }) as any,
      submitVerification: jest.fn() as any, listItem: jest.fn() as any,
    });
    const res = mockRes();
    await handler({ body } as Request, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns null verify/list signatures when those best-effort steps fail', async () => {
    const handler = makeAnchorListingHandler({
      mintCompressed: jest.fn(async () => ({ assetId: 'AID', signature: 'MSIG', leafIndex: 1, merkleTree: 'TREE' })) as any,
      submitVerification: jest.fn(async () => { throw new Error('verify boom'); }) as any,
      listItem: jest.fn(async () => { throw new Error('list boom'); }) as any,
    });
    const res = mockRes();
    await handler({ body } as Request, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      nftMintAddress: 'AID', isCompressed: true, mintSignature: 'MSIG', verifySignature: null, listSignature: null,
    }));
  });

  it('returns all signatures on the happy path', async () => {
    const handler = makeAnchorListingHandler({
      mintCompressed: jest.fn(async () => ({ assetId: 'AID', signature: 'MSIG', leafIndex: 1, merkleTree: 'TREE' })) as any,
      submitVerification: jest.fn(async () => 'VSIG') as any,
      listItem: jest.fn(async () => 'LSIG') as any,
    });
    const res = mockRes();
    await handler({ body } as Request, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ verifySignature: 'VSIG', listSignature: 'LSIG' }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- http-anchor-listing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator factory**

Write `backend/src/http/anchor-listing.ts`:
```ts
import type { Request, Response } from 'express';
import { mintCompressedNFTV2 } from '../solana/cnft.js';
import { mintStandardNFT } from '../solana/standard-nft.js';

export interface AnchorListingDeps {
  mintCompressed: (p: { leafOwner: string; metadataUri: string; name: string; merkleTree: string; coreCollection: string }) => Promise<{ assetId: string; signature: string; leafIndex: number; merkleTree: string }>;
  submitVerification: (p: { nftMint: string; confidenceBps: number; model: string; casePrefix: string }) => Promise<string>;
  listItem: (p: { nftMint: string; priceLamports: string; sellerWallet: string }) => Promise<string>;
}

export function makeAnchorListingHandler(deps: AnchorListingDeps) {
  return async function anchorListingHandler(req: Request, res: Response): Promise<void> {
    const b = req.body ?? {};
    if (!b.targetWallet || !b.metadataUri || !b.name || !b.merkleTree || !b.coreCollection) {
      res.status(400).json({ error: 'targetWallet, metadataUri, name, merkleTree, coreCollection are required' });
      return;
    }

    // 1) MINT — critical.
    let mint;
    try {
      mint = await deps.mintCompressed({
        leafOwner: b.targetWallet, metadataUri: b.metadataUri, name: b.name,
        merkleTree: b.merkleTree, coreCollection: b.coreCollection,
      });
    } catch (err) {
      res.status(502).json({ error: 'mint_failed', detail: (err as Error).message });
      return;
    }

    // 2) VERIFY (evidence-locker) — best-effort.
    let verifySignature: string | null = null;
    if (b.verification) {
      try {
        verifySignature = await deps.submitVerification({
          nftMint: mint.assetId,
          confidenceBps: b.verification.confidenceBps,
          model: b.verification.model,
          casePrefix: b.verification.casePrefix,
        });
      } catch (err) { console.warn('submitVerification failed (best-effort):', (err as Error).message); }
    }

    // 3) LIST — best-effort.
    let listSignature: string | null = null;
    if (b.listing) {
      try {
        listSignature = await deps.listItem({ nftMint: mint.assetId, priceLamports: b.listing.priceLamports, sellerWallet: b.targetWallet });
      } catch (err) { console.warn('listItem failed (best-effort):', (err as Error).message); }
    }

    res.json({
      nftMintAddress: mint.assetId, isCompressed: true, mintSignature: mint.signature,
      leafIndex: mint.leafIndex, merkleTree: mint.merkleTree, verifySignature, listSignature,
    });
  };
}
```
> The production binding (Task 11) wires `submitVerification`/`listItem` to thin adapters around the carried-over JS `verification.js` and `evidence-locker-client.js`/`solana.js`. Their internals are unchanged in Phase A.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm test -- http-anchor-listing`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add backend/src/http/anchor-listing.ts backend/tests/http-anchor-listing.test.ts
git commit -m "feat(write-service): POST /anchor-listing orchestrator (mint critical, verify/list best-effort)"
```

---

## Task 11: Express app wiring + entries

**Files:**
- Create: `backend/src/app.ts`
- Modify: `backend/src/dev.ts`, `backend/src/lambda.ts`

- [ ] **Step 1: Write the app + production handler bindings**

Write `backend/src/app.ts`:
```ts
import express from 'express';
import helmet from 'helmet';
import { sharedSecretAuth } from './middleware/auth.js';
import { mintHandler } from './http/mint.js';
import { makeAnchorListingHandler } from './http/anchor-listing.js';
import { mintCompressedNFTV2 } from './solana/cnft.js';
// Carried-over JS modules (Phase A keeps them as-is):
// @ts-expect-error JS module without types
import { submitVerification } from './services/verification.js';
// @ts-expect-error JS module without types
import { listItemOnMarketplace } from './services/solana.js';

const anchorListingHandler = makeAnchorListingHandler({
  mintCompressed: mintCompressedNFTV2,
  submitVerification: async (p) => submitVerification(p.nftMint, p.confidenceBps, p.model, p.casePrefix),
  listItem: async (p) => {
    const r = await listItemOnMarketplace(p.nftMint, Number(p.priceLamports) / 1e9, p.sellerWallet);
    return r?.signature ?? 'pending_user_signature';
  },
});

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(sharedSecretAuth); // everything below requires the shared secret
  app.post('/mint', mintHandler);
  app.post('/anchor-listing', anchorListingHandler);
  return app;
}
```
> If `verification.js`'s `submitVerification` signature differs, adapt the adapter arrow only (confirm by reading `src/services/verification.js` exports). Keep the adapter's input/return shape matching `AnchorListingDeps`.

- [ ] **Step 2: Reduce `dev.ts` to the new app**

Write `backend/src/dev.ts`:
```ts
import '../src/config/env.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3002;
createApp().listen(port, () => console.log(`Solana write service on :${port}`));
```
> If `src/config/env.js` does not exist on this branch, replace the import with `import 'dotenv/config';`.

- [ ] **Step 3: Reduce `lambda.ts` to the new app**

Write `backend/src/lambda.ts`:
```ts
import '../src/config/env.js';
import serverlessHttp from 'serverless-http';
import { createApp } from './app.js';

export const handler = serverlessHttp(createApp());
```

- [ ] **Step 4: Typecheck + boot smoke**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (the two `@ts-expect-error` lines absorb the untyped JS imports).
Run: `cd backend && node --import tsx src/dev.ts &` then `curl -s localhost:3002/health` → `{"ok":true}`; then `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3002/mint` → `401` (auth fail-closed). Kill the server.
> If `tsx` is unavailable, build first: `npx tsc && node dist/src/dev.js`.

- [ ] **Step 5: Commit**
```bash
git add backend/src/app.ts backend/src/dev.ts backend/src/lambda.ts
git commit -m "feat(write-service): express app wiring (health + auth + /mint + /anchor-listing)"
```

---

## Task 12: `setup-tree` CLI — parameterized depth/buffer/canopy

**Files:**
- Modify: `backend/scripts/setup-merkle-tree.js`

- [ ] **Step 1: Replace arg parsing with --depth/--buffer/--canopy and call createMerkleTreeV2**

Replace the body of `scripts/setup-merkle-tree.js` with:
```js
#!/usr/bin/env node
import '../src/config/env.js';
import { createMerkleTreeV2, capacityForDepth } from '../src/solana/tree.js';

function getFlag(name, def) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = parseInt(process.argv[i + 1], 10);
  return Number.isNaN(v) ? def : v;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node scripts/setup-merkle-tree.js [--depth 14] [--buffer 64] [--canopy 11]');
    process.exit(0);
  }
  if (!process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY) {
    console.error('HACKNYU_SERVER_WALLET_PRIVATE_KEY not set'); process.exit(1);
  }
  const maxDepth = getFlag('--depth', 14);
  const maxBufferSize = getFlag('--buffer', 64);
  const canopyDepth = getFlag('--canopy', 11);
  console.log(`Creating V2 tree: depth=${maxDepth} buffer=${maxBufferSize} canopy=${canopyDepth} capacity=${capacityForDepth(maxDepth).toLocaleString()}`);
  const r = await createMerkleTreeV2({ maxDepth, maxBufferSize, canopyDepth });
  console.log('\nAdd to .env:\nHACKNYU_MERKLE_TREE_ADDRESS=' + r.treeAddress + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
```
> The script imports the compiled/transpiled `tree.js`. Since the service runs as ESM JS at deploy time, either run via `node --import tsx` for local dev or `npm run build` first. Document the chosen run mode in `README.md` (Task 13).

- [ ] **Step 2: Verify the CLI parses flags (no network)**

Run: `cd backend && node --import tsx scripts/setup-merkle-tree.js --help`
Expected: prints usage and exits 0.

- [ ] **Step 3: Commit**
```bash
git add backend/scripts/setup-merkle-tree.js
git commit -m "feat(write-service): parameterized setup-tree CLI (depth/buffer/canopy → createTreeV2)"
```

---

## Task 13: `setup-collection` CLI + README + .env.example

**Files:**
- Create: `backend/scripts/setup-collection.js`
- Modify: `backend/.env.example`, `backend/README.md`

- [ ] **Step 1: Write the collection setup CLI**

Write `backend/scripts/setup-collection.js`:
```js
#!/usr/bin/env node
import '../src/config/env.js';
import { createRoyaltyCollection } from '../src/solana/collection.js';

async function main() {
  if (!process.env.HACKNYU_SERVER_WALLET_PRIVATE_KEY) { console.error('HACKNYU_SERVER_WALLET_PRIVATE_KEY not set'); process.exit(1); }
  const name = process.env.HACKNYU_COLLECTION_NAME || 'HypeChain Provenance';
  const uri = process.env.HACKNYU_COLLECTION_URI;
  if (!uri) { console.error('HACKNYU_COLLECTION_URI not set (collection metadata json)'); process.exit(1); }
  const bps = parseInt(process.env.HACKNYU_ROYALTY_BPS || '500', 10);
  // AllowList must include the program(s) allowed to transfer (our marketplace) to keep assets tradeable.
  const allow = (process.env.HACKNYU_MARKETPLACE_PROGRAM_ID ? [process.env.HACKNYU_MARKETPLACE_PROGRAM_ID] : []);
  if (allow.length === 0) console.warn('⚠️  No HACKNYU_MARKETPLACE_PROGRAM_ID — empty AllowList means assets are SOULBOUND (non-transferable). Set it before mainnet.');
  const r = await createRoyaltyCollection({ name, uri, royaltyBasisPoints: bps, allowListPrograms: allow });
  console.log('\nAdd to .env:\nHACKNYU_CORE_COLLECTION_ADDRESS=' + r.collection + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add env keys to `.env.example`**

Append to `backend/.env.example`:
```
# --- Solana write service ---
HACKNYU_MINT_SERVICE_SECRET=        # shared secret FastAPI sends as `Authorization: Bearer <secret>` (fail-closed)
HACKNYU_MERKLE_TREE_ADDRESS=        # from `npm run setup-tree`
HACKNYU_CORE_COLLECTION_ADDRESS=    # from `npm run setup-collection`
HACKNYU_COLLECTION_NAME=HypeChain Provenance
HACKNYU_COLLECTION_URI=             # collection metadata JSON URI
HACKNYU_ROYALTY_BPS=500             # 5%
HACKNYU_MARKETPLACE_PROGRAM_ID=     # program allowed to transfer (royalty AllowList); empty => soulbound
```

- [ ] **Step 3: Document run modes in README**

Add a "Solana write service" section to `backend/README.md` documenting: `npm test`, `npm run build`, `npm run setup-tree -- --depth 14 --buffer 64 --canopy 11`, `npm run setup-collection`, the `/health`, `/mint`, `/anchor-listing` endpoints and the `Authorization: Bearer` requirement, and the soulbound-AllowList caveat.

- [ ] **Step 4: Commit**
```bash
git add backend/scripts/setup-collection.js backend/.env.example backend/README.md
git commit -m "feat(write-service): setup-collection CLI + env + docs"
```

---

## Task 14: Retire the v1 cNFT module

**Files:**
- Delete: `backend/src/services/compressed-nft.js`

- [ ] **Step 1: Confirm nothing imports it anymore**

Run: `cd backend && grep -rn "compressed-nft" src/ scripts/ --include=*.js --include=*.ts | grep -v "src/services/compressed-nft.js:"`
Expected: no results (the new `src/solana/cnft.ts` + `tree.ts` fully replace it; `setup-merkle-tree.js` now imports `tree.js`).
> If any route (e.g. `src/routes/listing.js`) still imports it, that import belongs to the redundant Express API surface removed in Phase D — leave that route untouched here and STOP: note the lingering reference for Phase B/D rather than rewiring routes in Phase A.

- [ ] **Step 2: Delete and run the full suite**

Run: `cd backend && rm src/services/compressed-nft.js && npm test`
Expected: all unit tests PASS.

- [ ] **Step 3: Commit**
```bash
git add -A backend/src/services/compressed-nft.js
git commit -m "refactor(write-service): remove v1 compressed-nft module (superseded by V2)"
```

---

## Task 15: Skippable devnet integration test

**Files:**
- Create: `backend/tests/devnet.integration.test.ts`

- [ ] **Step 1: Write the gated end-to-end test**

Write `backend/tests/devnet.integration.test.ts`:
```ts
import { describe, it, expect } from '@jest/globals';
import { createMerkleTreeV2 } from '../src/solana/tree.js';
import { createRoyaltyCollection } from '../src/solana/collection.js';
import { mintCompressedNFTV2 } from '../src/solana/cnft.js';
import { Keypair } from '@solana/web3.js';

const RUN = process.env.RUN_DEVNET === '1';
(RUN ? describe : describe.skip)('devnet round-trip', () => {
  it('creates tree + collection and mints a V2 cNFT', async () => {
    const tree = await createMerkleTreeV2({ maxDepth: 14, maxBufferSize: 64, canopyDepth: 11 });
    const col = await createRoyaltyCollection({
      name: 'HypeChain Devnet', uri: 'https://example.com/c.json', royaltyBasisPoints: 500,
      allowListPrograms: process.env.HACKNYU_MARKETPLACE_PROGRAM_ID ? [process.env.HACKNYU_MARKETPLACE_PROGRAM_ID] : [],
    });
    const owner = Keypair.generate().publicKey.toBase58();
    const r = await mintCompressedNFTV2({
      leafOwner: owner, metadataUri: 'https://example.com/x.json', name: 'Devnet cNFT',
      merkleTree: tree.treeAddress, coreCollection: col.collection,
    });
    expect(r.assetId).toBeTruthy();
    expect(r.signature).toBeTruthy();
  }, 120_000);
});
```

- [ ] **Step 2: Verify it skips by default**

Run: `cd backend && npm test -- devnet`
Expected: test suite reports the describe block as skipped (no network calls).

- [ ] **Step 3: Commit**
```bash
git add backend/tests/devnet.integration.test.ts
git commit -m "test(write-service): skippable devnet round-trip (RUN_DEVNET=1)"
```

---

## Task 16: Full suite + plan close-out

- [ ] **Step 1: Run everything**

Run: `cd backend && npm test`
Expected: all unit tests PASS; devnet suite skipped.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Final commit (if anything uncommitted)**
```bash
git add -A && git commit -m "chore(write-service): Phase A complete — V2 cNFT write service"
```

---

## Phase boundaries (NOT in this plan)

- **Phase B** (separate plan): FastAPI `mint_client.py` (httpx, Bearer auth, timeouts) + repoint create-listing to `/anchor-listing` + delete Python write code. Requires this service deployed/runnable.
- **Phase C** (HUMAN-gated): real devnet `create-listing → pay` round-trip with `RUN_DEVNET=1`. Ground truth before mainnet. Cannot skip.
- **Phase D**: delete the redundant Express API surface (routes, ipfs/openrouter/payment/cache/arweave), keep only this service; VERSION bump + CHANGELOG.

## Manual / human steps (cannot be automated here)

- Provisioning real devnet SOL to the server wallet before `setup-tree`/`setup-collection`.
- Running `setup-tree` and `setup-collection` once and copying the printed addresses into `.env` / deploy secrets.
- Choosing the mainnet tree params and the final AllowList program set before the mainnet flip.

## Open items flagged during planning

- **`BubblegumV2` collection-plugin type name** — verified in Task 1 Step 3 against installed mpl-core; correct the literal in Task 5 if it differs.
- **`verification.js` `submitVerification` signature** — confirm exact params when wiring the adapter in Task 11.
- **AllowList soulbound edge** — an empty AllowList freezes transfers; the marketplace program id must be included before any real trading.
