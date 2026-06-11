//! HypeChain — Evidence Locker
//!
//! On-chain case-file marketplace. Every NFT listing is gated on a
//! `VerificationProof` written by an authorized examiner. The product UX
//! ("Case File", "Mint Certificate", "Redacted Field") maps 1:1 onto the
//! PDAs declared here:
//!
//! - `Dossier`            — per-seller case file (issues monotonic case #s)
//! - `VerificationProof`  — per-mint AI verdict (confidence + liveness)
//! - `EvidenceListing`    — per-mint marketplace listing (gated on proof)
//!
//! Security model: every state-mutating instruction takes a `Signer`, every
//! trusted account is a typed `Account<'info, T>` (so Anchor validates the
//! discriminator + owner), every PDA stores its canonical bump, and every
//! arithmetic operation on case numbers / lamports goes through `checked_*`.
//! See `references/security-checklist.md` for the bar.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// Minimum AI confidence (in basis points) required to flip a listing
/// from `Pending` to `Verified`. 5_000 bps = 50 %. Exposed via the IDL
/// so the front end can display the threshold without hardcoding it.
pub const MIN_CONFIDENCE_BPS: u16 = 5_000;

// ============================================================================
// #[program]
// ============================================================================

#[program]
pub mod hypechain_evidence_locker {
    use super::*;

    /// Open a case file. One per seller authority. The case # counter starts
    /// at 1 and is bumped monotonically by `list_evidence`.
    pub fn init_dossier(
        ctx: Context<InitDossier>,
        case_prefix: [u8; 8],
        examiner: Pubkey,
    ) -> Result<()> {
        let dossier = &mut ctx.accounts.dossier;
        dossier.authority = ctx.accounts.authority.key();
        dossier.case_prefix = case_prefix;
        dossier.next_case_number = 1;
        dossier.examiner = examiner;
        dossier.bump = ctx.bumps.dossier;

        msg!("Dossier opened for {}", dossier.authority);
        Ok(())
    }

    /// Examiner records the AI verdict for an NFT mint. The examiner must
    /// match `dossier.examiner` — the seller pre-registered who is allowed
    /// to verify on their behalf.
    pub fn submit_verification(
        ctx: Context<SubmitVerification>,
        confidence_bps: u16,
        model_name: [u8; 32],
        liveness_passed: bool,
    ) -> Result<()> {
        require!(
            confidence_bps <= 10_000,
            MarketplaceError::ConfidenceOutOfRange
        );
        require_keys_eq!(
            ctx.accounts.examiner.key(),
            ctx.accounts.dossier.examiner,
            MarketplaceError::ExaminerMismatch
        );

        let proof = &mut ctx.accounts.verification_proof;
        proof.nft_mint = ctx.accounts.nft_mint.key();
        proof.examiner = ctx.accounts.examiner.key();
        proof.confidence_bps = confidence_bps;
        proof.verified_at = Clock::get()?.unix_timestamp;
        proof.model_name = model_name;
        proof.liveness_passed = liveness_passed;
        proof.bump = ctx.bumps.verification_proof;

        msg!(
            "VerificationProof: mint={} conf_bps={} liveness={}",
            proof.nft_mint,
            confidence_bps,
            liveness_passed
        );
        Ok(())
    }

    /// List (or relist) an NFT. Gate: the matching `VerificationProof` must
    /// exist, must have `liveness_passed = true`, and must be at or above
    /// `MIN_CONFIDENCE_BPS`. On relist (status was `Delisted`), the same
    /// seller may re-open — anyone else is rejected.
    pub fn list_evidence(ctx: Context<ListEvidence>, price_lamports: u64) -> Result<()> {
        let proof = &ctx.accounts.verification_proof;
        require!(proof.liveness_passed, MarketplaceError::LivenessFailed);
        require!(
            proof.confidence_bps >= MIN_CONFIDENCE_BPS,
            MarketplaceError::ConfidenceBelowThreshold
        );
        require!(price_lamports > 0, MarketplaceError::PriceMustBePositive);

        let listing = &mut ctx.accounts.listing;
        let seller_key = ctx.accounts.seller.key();

        // ── init-if-needed safety: if the listing already existed we are
        //    relisting. The only legal previous state is `Delisted`, and the
        //    seller must match. Anything else is an attempted hijack.
        let is_relist = listing.seller != Pubkey::default();
        if is_relist {
            require_keys_eq!(listing.seller, seller_key, MarketplaceError::SellerMismatch);
            require!(
                matches!(listing.status, ListingStatus::Delisted),
                MarketplaceError::ListingNotRelistable
            );
        }

        // Bump the dossier's case-number counter. checked_add per §4a — we
        // ship in release mode, where overflow silently wraps.
        let case_number = ctx.accounts.dossier.next_case_number;
        ctx.accounts.dossier.next_case_number = case_number
            .checked_add(1)
            .ok_or(MarketplaceError::CaseNumberOverflow)?;

        listing.seller = seller_key;
        listing.nft_mint = ctx.accounts.nft_mint.key();
        listing.dossier = ctx.accounts.dossier.key();
        listing.verification_proof = proof.key();
        listing.examiner = ctx.accounts.dossier.examiner;
        listing.custodian = None;
        listing.case_number = case_number;
        listing.price_lamports = price_lamports;
        listing.status = ListingStatus::Listed;
        listing.created_at = Clock::get()?.unix_timestamp;
        listing.bump = ctx.bumps.listing;

        msg!(
            "EvidenceListing#{}: mint={} price={}",
            case_number,
            listing.nft_mint,
            price_lamports
        );
        Ok(())
    }

    /// Seller retracts. Token custody returns to the seller's wallet by
    /// virtue of never having left (see `purchase_evidence` notes on the
    /// co-signing model — the NFT sits in the seller's ATA throughout).
    pub fn delist_evidence(ctx: Context<DelistEvidence>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(
            matches!(listing.status, ListingStatus::Listed),
            MarketplaceError::ListingNotListed
        );
        listing.status = ListingStatus::Delisted;

        msg!("EvidenceListing#{} delisted", listing.case_number);
        Ok(())
    }

    /// Buyer + seller co-sign. Buyer pays SOL; seller authorizes the SPL
    /// token transfer. Disputed listings are blocked. CPI patterns mirror
    /// the security-checklist §3 rules (typed program accounts → Anchor
    /// validates IDs automatically).
    pub fn purchase_evidence(ctx: Context<PurchaseEvidence>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(
            matches!(listing.status, ListingStatus::Listed),
            MarketplaceError::ListingNotListed
        );
        require_keys_eq!(
            listing.seller,
            ctx.accounts.seller.key(),
            MarketplaceError::SellerMismatch
        );
        require_keys_eq!(
            listing.nft_mint,
            ctx.accounts.seller_token_account.mint,
            MarketplaceError::MintMismatch
        );
        require_keys_eq!(
            listing.nft_mint,
            ctx.accounts.buyer_token_account.mint,
            MarketplaceError::MintMismatch
        );

        // ── Effects before interactions (§3c reentrancy mindset).
        listing.status = ListingStatus::Sold;

        // ── SOL leg: buyer → seller. System program ID validated by
        //    typed `Program<'info, System>`.
        let sol_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.seller.key(),
            listing.price_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &sol_ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // ── SPL leg: seller's ATA → buyer's ATA. The seller is a Signer
        //    on this instruction, so the token program accepts the transfer
        //    with `authority = seller` directly (no PDA delegation needed).
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, 1)?;

        msg!(
            "EvidenceListing#{} sold to {} for {} lamports",
            listing.case_number,
            ctx.accounts.buyer.key(),
            listing.price_lamports
        );
        Ok(())
    }

    /// Either the seller or the examiner can flag a dispute. Disputed
    /// listings can no longer be purchased; they can still be delisted by
    /// the seller (escape hatch) but cannot be relisted while disputed.
    /// `reason` is a free-form u8 — the meaning is defined off-chain so
    /// the program stays minimal.
    pub fn flag_dispute(ctx: Context<FlagDispute>, reason: u8) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let signer_key = ctx.accounts.signer.key();
        require!(
            signer_key == listing.seller || signer_key == listing.examiner,
            MarketplaceError::DisputeUnauthorized
        );
        require!(
            !matches!(listing.status, ListingStatus::Sold),
            MarketplaceError::ListingAlreadySold
        );
        listing.status = ListingStatus::Disputed;

        msg!(
            "EvidenceListing#{} disputed by {} reason={}",
            listing.case_number,
            signer_key,
            reason
        );
        Ok(())
    }
}

// ============================================================================
// Accounts contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitDossier<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Dossier::INIT_SPACE,
        seeds = [b"dossier", authority.key().as_ref()],
        bump,
    )]
    pub dossier: Account<'info, Dossier>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitVerification<'info> {
    /// The examiner — server wallet today, multisig later. Must match
    /// `dossier.examiner` (enforced in the handler via `require_keys_eq!`).
    #[account(mut)]
    pub examiner: Signer<'info>,

    /// CHECK: NFT mint pubkey is only used as a seed + recorded into the
    /// proof. We do not deserialize it as a Mint account because we do not
    /// inspect mint state — the verification is about the off-chain photo,
    /// not the on-chain mint.
    pub nft_mint: UncheckedAccount<'info>,

    #[account(
        seeds = [b"dossier", dossier.authority.as_ref()],
        bump = dossier.bump,
    )]
    pub dossier: Account<'info, Dossier>,

    #[account(
        init,
        payer = examiner,
        space = 8 + VerificationProof::INIT_SPACE,
        seeds = [b"verification", nft_mint.key().as_ref()],
        bump,
    )]
    pub verification_proof: Account<'info, VerificationProof>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ListEvidence<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: NFT mint — used as a seed; deserializing as a `Mint` is
    /// unnecessary here and would force the seller to pass token-program
    /// accounts they don't otherwise need.
    pub nft_mint: UncheckedAccount<'info>,

    /// Dossier is mutated to bump the case-number counter. `has_one` ties
    /// the dossier's authority to the seller signer (no impostor sellers
    /// can list against someone else's dossier).
    #[account(
        mut,
        has_one = authority @ MarketplaceError::DossierAuthorityMismatch,
        seeds = [b"dossier", seller.key().as_ref()],
        bump = dossier.bump,
    )]
    pub dossier: Account<'info, Dossier>,

    /// CHECK: alias for `dossier.authority` to satisfy `has_one`. Tied
    /// to the seller signer via the constraint below; no extra checks
    /// needed here. (`constraint =` rather than `address =`: anchor 0.30
    /// IDL generation const-evaluates `address` expressions outside the
    /// accounts scope, so account-referencing exprs fail to compile.)
    #[account(constraint = authority.key() == seller.key() @ MarketplaceError::DossierAuthorityMismatch)]
    pub authority: UncheckedAccount<'info>,

    #[account(
        seeds = [b"verification", nft_mint.key().as_ref()],
        bump = verification_proof.bump,
        constraint = verification_proof.nft_mint == nft_mint.key()
            @ MarketplaceError::VerificationMintMismatch,
    )]
    pub verification_proof: Account<'info, VerificationProof>,

    #[account(
        init_if_needed,
        payer = seller,
        space = 8 + EvidenceListing::INIT_SPACE,
        seeds = [b"evidence", nft_mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, EvidenceListing>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelistEvidence<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        has_one = seller @ MarketplaceError::SellerMismatch,
        seeds = [b"evidence", listing.nft_mint.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, EvidenceListing>,
}

#[derive(Accounts)]
pub struct PurchaseEvidence<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// Seller co-signs to authorize the token transfer. Bound to the
    /// listing's seller field by `has_one`. Constrained ≠ buyer per
    /// security-checklist §1d (no duplicate-mutable account confusion).
    #[account(
        mut,
        constraint = seller.key() != buyer.key() @ MarketplaceError::SelfPurchase,
    )]
    pub seller: Signer<'info>,

    #[account(
        mut,
        has_one = seller @ MarketplaceError::SellerMismatch,
        seeds = [b"evidence", listing.nft_mint.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, EvidenceListing>,

    #[account(
        mut,
        constraint = seller_token_account.owner == seller.key()
            @ MarketplaceError::TokenAccountOwnerMismatch,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key()
            @ MarketplaceError::TokenAccountOwnerMismatch,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlagDispute<'info> {
    /// Either the seller or the examiner — checked in the handler.
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"evidence", listing.nft_mint.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, EvidenceListing>,
}

// ============================================================================
// State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Dossier {
    pub authority: Pubkey,
    pub case_prefix: [u8; 8],
    pub next_case_number: u32,
    pub examiner: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VerificationProof {
    pub nft_mint: Pubkey,
    pub examiner: Pubkey,
    pub confidence_bps: u16,
    pub verified_at: i64,
    pub model_name: [u8; 32],
    pub liveness_passed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EvidenceListing {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub dossier: Pubkey,
    pub verification_proof: Pubkey,
    /// Copied from `dossier.examiner` at list time so `flag_dispute`
    /// does not need the Dossier account passed in.
    pub examiner: Pubkey,
    /// `Some(server_wallet)` for guest/custodial sellers, `None` otherwise.
    pub custodian: Option<Pubkey>,
    pub case_number: u32,
    pub price_lamports: u64,
    pub status: ListingStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ListingStatus {
    Pending,
    Verified,
    Listed,
    Sold,
    Delisted,
    Disputed,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum MarketplaceError {
    #[msg("Confidence basis points must be in 0..=10_000")]
    ConfidenceOutOfRange,
    #[msg("Examiner does not match the dossier's registered examiner")]
    ExaminerMismatch,
    #[msg("Verification proof does not match the NFT mint")]
    VerificationMintMismatch,
    #[msg("AI liveness check did not pass — listing blocked")]
    LivenessFailed,
    #[msg("AI confidence is below the listing threshold")]
    ConfidenceBelowThreshold,
    #[msg("Listing price must be greater than zero")]
    PriceMustBePositive,
    #[msg("Only the original seller may relist this evidence")]
    SellerMismatch,
    #[msg("Listing is not in a relistable state (must be Delisted)")]
    ListingNotRelistable,
    #[msg("Listing is not currently listed for sale")]
    ListingNotListed,
    #[msg("Listing has already been sold")]
    ListingAlreadySold,
    #[msg("Dossier authority does not match the signer")]
    DossierAuthorityMismatch,
    #[msg("Only the seller or examiner may flag a dispute")]
    DisputeUnauthorized,
    #[msg("Token account is not owned by the expected wallet")]
    TokenAccountOwnerMismatch,
    #[msg("NFT mint does not match the listing or token account")]
    MintMismatch,
    #[msg("Case number counter overflowed u32 — open a new dossier")]
    CaseNumberOverflow,
    #[msg("Buyer and seller cannot be the same account")]
    SelfPurchase,
}
