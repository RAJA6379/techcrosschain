
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("GHwq3cme1Kfm8TAgTUatuNW8Aw9Mm5KgsWQW9zP3QagQ");

const SWAP_FEE_BPS: u16 = 30; // 0.30%

#[program]
pub mod minswap_solana {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(
            ctx.accounts.token_a_mint.key().to_bytes()
                < ctx.accounts.token_b_mint.key().to_bytes(),
            MinSwapError::InvalidMintOrder
        );

        pool.authority = ctx.accounts.authority.key();
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.token_a_vault = ctx.accounts.token_a_vault.key();
        pool.token_b_vault = ctx.accounts.token_b_vault.key();
        pool.total_liquidity = 0;
        pool.fee_bps = SWAP_FEE_BPS;
        pool.bump = ctx.bumps.pool;

        msg!("MinSwap liquidity pool initialized");
        msg!("Token A: {}", pool.token_a_mint);
        msg!("Token B: {}", pool.token_b_mint);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [
            b"pool",
            token_a_mint.key().as_ref(),
            token_b_mint.key().as_ref()
        ],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault_a", pool.key().as_ref()],
        bump,
        token::mint = token_a_mint,
        token::authority = pool
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault_b", pool.key().as_ref()],
        bump,
        token::mint = token_b_mint,
        token::authority = pool
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub total_liquidity: u64,
    pub fee_bps: u16,
    pub bump: u8,
}

#[error_code]
pub enum MinSwapError {
    #[msg("Token mints must be distinct and ordered")]
    InvalidMintOrder,
}
