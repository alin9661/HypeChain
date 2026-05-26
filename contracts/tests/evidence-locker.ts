/**
 * HypeChain — Evidence Locker integration tests.
 *
 * Each instruction gets:
 *   1. A happy-path assertion (state on-chain matches what we wrote).
 *   2. At least one failure-mode assertion (the gate actually gates).
 *
 * Tests share a single SPL token mint + ATAs scaffolded in `before()` to
 * keep the runtime under the devnet RPC budget. New mints would mean new
 * `submit_verification` calls — fine, but slow.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

import { HypechainEvidenceLocker } from "../target/types/hypechain_evidence_locker";

const CASE_PREFIX = Buffer.from("HC-2026-", "utf8"); // exactly 8 bytes
const MODEL_NAME = Buffer.alloc(32);
Buffer.from("VISION-4O", "utf8").copy(MODEL_NAME);

function pad32(seed: Buffer): Buffer {
  return Buffer.from(seed);
}

async function airdrop(connection: anchor.web3.Connection, pk: PublicKey, sol = 5) {
  const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

describe("hypechain-evidence-locker", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .HypechainEvidenceLocker as Program<HypechainEvidenceLocker>;
  const connection = provider.connection;

  // Actors
  const seller = Keypair.generate();
  const examiner = Keypair.generate();
  const buyer = Keypair.generate();

  // Shared NFT mint state — created in `before`
  let nftMint: PublicKey;
  let sellerAta: PublicKey;
  let buyerAta: PublicKey;

  // PDAs
  let dossierPda: PublicKey;
  let verificationPda: PublicKey;
  let listingPda: PublicKey;

  before(async () => {
    await airdrop(connection, seller.publicKey, 10);
    await airdrop(connection, examiner.publicKey, 5);
    await airdrop(connection, buyer.publicKey, 10);

    // Mint a 1-of-1 "NFT" (0 decimals, supply 1) owned by the seller.
    nftMint = await createMint(
      connection,
      seller,
      seller.publicKey,
      null,
      0
    );
    sellerAta = await createAssociatedTokenAccount(
      connection,
      seller,
      nftMint,
      seller.publicKey
    );
    buyerAta = await createAssociatedTokenAccount(
      connection,
      buyer,
      nftMint,
      buyer.publicKey
    );
    await mintTo(connection, seller, nftMint, sellerAta, seller, 1);

    [dossierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dossier"), seller.publicKey.toBuffer()],
      program.programId
    );
    [verificationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("verification"), nftMint.toBuffer()],
      program.programId
    );
    [listingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("evidence"), nftMint.toBuffer()],
      program.programId
    );
  });

  // ─────────────────────────────────────────────────────── init_dossier ────

  describe("init_dossier", () => {
    it("opens a dossier with the configured examiner and case prefix", async () => {
      await program.methods
        .initDossier(Array.from(CASE_PREFIX) as any, examiner.publicKey)
        .accounts({
          authority: seller.publicKey,
          dossier: dossierPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const dossier = await program.account.dossier.fetch(dossierPda);
      expect(dossier.authority.toBase58()).to.eq(seller.publicKey.toBase58());
      expect(dossier.examiner.toBase58()).to.eq(examiner.publicKey.toBase58());
      expect(dossier.nextCaseNumber).to.eq(1);
      expect(Buffer.from(dossier.casePrefix).toString("utf8")).to.eq("HC-2026-");
    });

    it("rejects a second init for the same authority (already exists)", async () => {
      try {
        await program.methods
          .initDossier(Array.from(CASE_PREFIX) as any, examiner.publicKey)
          .accounts({
            authority: seller.publicKey,
            dossier: dossierPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        expect.fail("expected re-init to fail");
      } catch (err: any) {
        // Anchor's `init` constraint raises this on existing-account.
        expect(String(err)).to.match(/already in use|account address is already/i);
      }
    });
  });

  // ─────────────────────────────────────────────── submit_verification ────

  describe("submit_verification", () => {
    it("records a passing verification when examiner matches dossier", async () => {
      await program.methods
        .submitVerification(7500, Array.from(MODEL_NAME) as any, true)
        .accounts({
          examiner: examiner.publicKey,
          nftMint,
          dossier: dossierPda,
          verificationProof: verificationPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([examiner])
        .rpc();

      const proof = await program.account.verificationProof.fetch(verificationPda);
      expect(proof.nftMint.toBase58()).to.eq(nftMint.toBase58());
      expect(proof.examiner.toBase58()).to.eq(examiner.publicKey.toBase58());
      expect(proof.confidenceBps).to.eq(7500);
      expect(proof.livenessPassed).to.eq(true);
    });

    it("rejects a wrong examiner (ExaminerMismatch)", async () => {
      const fakeExaminer = Keypair.generate();
      await airdrop(connection, fakeExaminer.publicKey, 1);
      // Use a fresh mint so the PDA doesn't already exist
      const otherMint = await createMint(
        connection,
        seller,
        seller.publicKey,
        null,
        0
      );
      const [otherVerification] = PublicKey.findProgramAddressSync(
        [Buffer.from("verification"), otherMint.toBuffer()],
        program.programId
      );
      try {
        await program.methods
          .submitVerification(8000, Array.from(MODEL_NAME) as any, true)
          .accounts({
            examiner: fakeExaminer.publicKey,
            nftMint: otherMint,
            dossier: dossierPda,
            verificationProof: otherVerification,
            systemProgram: SystemProgram.programId,
          })
          .signers([fakeExaminer])
          .rpc();
        expect.fail("expected examiner mismatch");
      } catch (err: any) {
        expect(String(err)).to.match(/ExaminerMismatch/);
      }
    });
  });

  // ─────────────────────────────────────────────────────── list_evidence ────

  describe("list_evidence", () => {
    const price = new BN(2 * LAMPORTS_PER_SOL);

    it("creates a listing when verification is passing", async () => {
      await program.methods
        .listEvidence(price)
        .accounts({
          seller: seller.publicKey,
          nftMint,
          dossier: dossierPda,
          authority: seller.publicKey,
          verificationProof: verificationPda,
          listing: listingPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const listing = await program.account.evidenceListing.fetch(listingPda);
      expect(listing.seller.toBase58()).to.eq(seller.publicKey.toBase58());
      expect(listing.priceLamports.toString()).to.eq(price.toString());
      expect(listing.caseNumber).to.eq(1);
      // After listing, the dossier's counter advanced.
      const dossier = await program.account.dossier.fetch(dossierPda);
      expect(dossier.nextCaseNumber).to.eq(2);
    });

    it("rejects listing when confidence is below threshold", async () => {
      // Fresh mint with a low-confidence proof.
      const weakMint = await createMint(
        connection,
        seller,
        seller.publicKey,
        null,
        0
      );
      const [weakVerify] = PublicKey.findProgramAddressSync(
        [Buffer.from("verification"), weakMint.toBuffer()],
        program.programId
      );
      const [weakListing] = PublicKey.findProgramAddressSync(
        [Buffer.from("evidence"), weakMint.toBuffer()],
        program.programId
      );
      await program.methods
        .submitVerification(1000, Array.from(MODEL_NAME) as any, true)
        .accounts({
          examiner: examiner.publicKey,
          nftMint: weakMint,
          dossier: dossierPda,
          verificationProof: weakVerify,
          systemProgram: SystemProgram.programId,
        })
        .signers([examiner])
        .rpc();
      try {
        await program.methods
          .listEvidence(price)
          .accounts({
            seller: seller.publicKey,
            nftMint: weakMint,
            dossier: dossierPda,
            authority: seller.publicKey,
            verificationProof: weakVerify,
            listing: weakListing,
            systemProgram: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        expect.fail("expected ConfidenceBelowThreshold");
      } catch (err: any) {
        expect(String(err)).to.match(/ConfidenceBelowThreshold/);
      }
    });

    it("rejects listing when liveness failed", async () => {
      const noLivenessMint = await createMint(
        connection,
        seller,
        seller.publicKey,
        null,
        0
      );
      const [nlVerify] = PublicKey.findProgramAddressSync(
        [Buffer.from("verification"), noLivenessMint.toBuffer()],
        program.programId
      );
      const [nlListing] = PublicKey.findProgramAddressSync(
        [Buffer.from("evidence"), noLivenessMint.toBuffer()],
        program.programId
      );
      await program.methods
        .submitVerification(9500, Array.from(MODEL_NAME) as any, false)
        .accounts({
          examiner: examiner.publicKey,
          nftMint: noLivenessMint,
          dossier: dossierPda,
          verificationProof: nlVerify,
          systemProgram: SystemProgram.programId,
        })
        .signers([examiner])
        .rpc();
      try {
        await program.methods
          .listEvidence(price)
          .accounts({
            seller: seller.publicKey,
            nftMint: noLivenessMint,
            dossier: dossierPda,
            authority: seller.publicKey,
            verificationProof: nlVerify,
            listing: nlListing,
            systemProgram: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        expect.fail("expected LivenessFailed");
      } catch (err: any) {
        expect(String(err)).to.match(/LivenessFailed/);
      }
    });
  });

  // ─────────────────────────────────────────────── delist + relist flow ────

  describe("delist_evidence + relist", () => {
    it("seller can delist their listing", async () => {
      await program.methods
        .delistEvidence()
        .accounts({
          seller: seller.publicKey,
          listing: listingPda,
        })
        .signers([seller])
        .rpc();
      const listing = await program.account.evidenceListing.fetch(listingPda);
      expect(listing.status).to.deep.equal({ delisted: {} });
    });

    it("seller can relist a Delisted listing", async () => {
      await program.methods
        .listEvidence(new BN(3 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          nftMint,
          dossier: dossierPda,
          authority: seller.publicKey,
          verificationProof: verificationPda,
          listing: listingPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
      const listing = await program.account.evidenceListing.fetch(listingPda);
      expect(listing.status).to.deep.equal({ listed: {} });
      expect(listing.priceLamports.toString()).to.eq(
        new BN(3 * LAMPORTS_PER_SOL).toString()
      );
    });

    it("a different seller cannot hijack a delisted listing", async () => {
      // Setup: delist first
      await program.methods
        .delistEvidence()
        .accounts({ seller: seller.publicKey, listing: listingPda })
        .signers([seller])
        .rpc();

      const hijacker = Keypair.generate();
      await airdrop(connection, hijacker.publicKey, 2);
      try {
        await program.methods
          .listEvidence(new BN(LAMPORTS_PER_SOL))
          .accounts({
            seller: hijacker.publicKey,
            nftMint,
            dossier: dossierPda, // hijacker doesn't own this dossier
            authority: hijacker.publicKey,
            verificationProof: verificationPda,
            listing: listingPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([hijacker])
          .rpc();
        expect.fail("expected hijack to fail");
      } catch (err: any) {
        // Should fail on dossier seed mismatch (seeds use seller.key())
        expect(String(err)).to.match(/ConstraintSeeds|Constraint|seeds/i);
      }
      // Restore listed state for the next test
      await program.methods
        .listEvidence(new BN(2 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          nftMint,
          dossier: dossierPda,
          authority: seller.publicKey,
          verificationProof: verificationPda,
          listing: listingPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
    });
  });

  // ──────────────────────────────────────────────────── purchase_evidence ──

  describe("purchase_evidence", () => {
    it("transfers SOL and the NFT atomically when buyer + seller co-sign", async () => {
      const sellerBalanceBefore = await connection.getBalance(seller.publicKey);
      const listingBefore = await program.account.evidenceListing.fetch(listingPda);

      await program.methods
        .purchaseEvidence()
        .accounts({
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          listing: listingPda,
          sellerTokenAccount: sellerAta,
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer, seller])
        .rpc();

      const buyerAtaAfter = await getAccount(connection, buyerAta);
      const sellerAtaAfter = await getAccount(connection, sellerAta);
      expect(buyerAtaAfter.amount.toString()).to.eq("1");
      expect(sellerAtaAfter.amount.toString()).to.eq("0");

      const sellerBalanceAfter = await connection.getBalance(seller.publicKey);
      // Seller netted ~price (minus a tiny tx fee for the seller's signature).
      expect(sellerBalanceAfter - sellerBalanceBefore).to.be.greaterThan(
        listingBefore.priceLamports.toNumber() - 50_000
      );

      const listingAfter = await program.account.evidenceListing.fetch(listingPda);
      expect(listingAfter.status).to.deep.equal({ sold: {} });
    });

    it("rejects purchase of a Sold listing", async () => {
      try {
        await program.methods
          .purchaseEvidence()
          .accounts({
            buyer: buyer.publicKey,
            seller: seller.publicKey,
            listing: listingPda,
            sellerTokenAccount: sellerAta,
            buyerTokenAccount: buyerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer, seller])
          .rpc();
        expect.fail("expected ListingNotListed");
      } catch (err: any) {
        expect(String(err)).to.match(/ListingNotListed/);
      }
    });
  });

  // ──────────────────────────────────────────────────────── flag_dispute ───

  describe("flag_dispute", () => {
    // Use a fresh mint for the dispute flow since the main listing is Sold.
    let disputeMint: PublicKey;
    let disputeVerify: PublicKey;
    let disputeListing: PublicKey;

    before(async () => {
      disputeMint = await createMint(
        connection,
        seller,
        seller.publicKey,
        null,
        0
      );
      [disputeVerify] = PublicKey.findProgramAddressSync(
        [Buffer.from("verification"), disputeMint.toBuffer()],
        program.programId
      );
      [disputeListing] = PublicKey.findProgramAddressSync(
        [Buffer.from("evidence"), disputeMint.toBuffer()],
        program.programId
      );
      await program.methods
        .submitVerification(8800, Array.from(MODEL_NAME) as any, true)
        .accounts({
          examiner: examiner.publicKey,
          nftMint: disputeMint,
          dossier: dossierPda,
          verificationProof: disputeVerify,
          systemProgram: SystemProgram.programId,
        })
        .signers([examiner])
        .rpc();
      await program.methods
        .listEvidence(new BN(LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          nftMint: disputeMint,
          dossier: dossierPda,
          authority: seller.publicKey,
          verificationProof: disputeVerify,
          listing: disputeListing,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
    });

    it("examiner can flag a dispute", async () => {
      await program.methods
        .flagDispute(7) // reason code 7 — meaning defined off-chain
        .accounts({
          signer: examiner.publicKey,
          listing: disputeListing,
        })
        .signers([examiner])
        .rpc();
      const l = await program.account.evidenceListing.fetch(disputeListing);
      expect(l.status).to.deep.equal({ disputed: {} });
    });

    it("rejects dispute from an unrelated signer", async () => {
      const randomKp = Keypair.generate();
      await airdrop(connection, randomKp.publicKey, 1);
      try {
        await program.methods
          .flagDispute(0)
          .accounts({
            signer: randomKp.publicKey,
            listing: disputeListing,
          })
          .signers([randomKp])
          .rpc();
        expect.fail("expected DisputeUnauthorized");
      } catch (err: any) {
        expect(String(err)).to.match(/DisputeUnauthorized/);
      }
    });
  });
});
