use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod hypechain_marketplace {
    use super::*;

    /// Lists an NFT for sale on the marketplace
    pub fn list_item(ctx: Context<ListItem>, price_sol: u64) -> Result<()> {
        let listing = &mut ctx.accounts.product_listing;

        // Set listing data
        listing.seller = ctx.accounts.seller.key();
        listing.nft_mint = ctx.accounts.nft_mint.key();
        listing.price_sol = price_sol;
        listing.is_listed = true;
        listing.bump = ctx.bumps.product_listing;

        msg!("NFT listed for sale!");
        msg!("Seller: {}", listing.seller);
        msg!("NFT Mint: {}", listing.nft_mint);
        msg!("Price: {} lamports", price_sol);

        Ok(())
    }

    /// Removes a listing from the marketplace
    pub fn delist_item(ctx: Context<DelistItem>) -> Result<()> {
        let listing = &mut ctx.accounts.product_listing;

        // Verify seller is the one who listed it
        require!(
            listing.seller == ctx.accounts.seller.key(),
            MarketplaceError::UnauthorizedSeller
        );

        // Mark as not listed
        listing.is_listed = false;

        msg!("NFT delisted from marketplace");
        msg!("NFT Mint: {}", listing.nft_mint);

        Ok(())
    }

    /// Purchases an NFT from the marketplace
    pub fn buy_item(ctx: Context<BuyItem>) -> Result<()> {
        let listing = &mut ctx.accounts.product_listing;

        // Verify item is listed
        require!(
            listing.is_listed,
            MarketplaceError::ItemNotListed
        );

        // Transfer SOL from buyer to seller
        let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &listing.seller,
            listing.price_sol,
        );

        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.seller_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer NFT from seller to buyer
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.seller_account.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, 1)?; // Transfer 1 NFT

        // Mark as not listed
        listing.is_listed = false;

        msg!("NFT purchased successfully!");
        msg!("Buyer: {}", ctx.accounts.buyer.key());
        msg!("Price paid: {} lamports", listing.price_sol);

        Ok(())
    }
}

// ========================================
// Instruction Contexts
// ========================================

#[derive(Accounts)]
pub struct ListItem<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: NFT mint address (validated by token account)
    pub nft_mint: AccountInfo<'info>,

    /// PDA for storing listing information
    /// Seeds: ["product_listing", nft_mint]
    #[account(
        init_if_needed,
        payer = seller,
        space = ProductListing::LEN,
        seeds = [b"product_listing", nft_mint.key().as_ref()],
        bump
    )]
    pub product_listing: Account<'info, ProductListing>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelistItem<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: NFT mint address
    pub nft_mint: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"product_listing", nft_mint.key().as_ref()],
        bump = product_listing.bump
    )]
    pub product_listing: Account<'info, ProductListing>,
}

#[derive(Accounts)]
pub struct BuyItem<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller account (receives SOL)
    #[account(mut)]
    pub seller_account: AccountInfo<'info>,

    /// CHECK: NFT mint address
    pub nft_mint: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"product_listing", nft_mint.key().as_ref()],
        bump = product_listing.bump
    )]
    pub product_listing: Account<'info, ProductListing>,

    /// Seller's token account (holds the NFT)
    #[account(mut)]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// Buyer's token account (receives the NFT)
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ========================================
// Account Structures
// ========================================

#[account]
pub struct ProductListing {
    pub seller: Pubkey,        // 32 bytes
    pub nft_mint: Pubkey,      // 32 bytes
    pub price_sol: u64,        // 8 bytes
    pub is_listed: bool,       // 1 byte
    pub bump: u8,              // 1 byte
}

impl ProductListing {
    pub const LEN: usize = 8 + // discriminator
                           32 + // seller
                           32 + // nft_mint
                           8 + // price_sol
                           1 + // is_listed
                           1; // bump
}

// ========================================
// Error Codes
// ========================================

#[error_code]
pub enum MarketplaceError {
    #[msg("Only the seller can delist this item")]
    UnauthorizedSeller,

    #[msg("This item is not currently listed for sale")]
    ItemNotListed,

    #[msg("Insufficient funds to purchase this item")]
    InsufficientFunds,

    #[msg("Invalid NFT mint address")]
    InvalidNFTMint,
}
