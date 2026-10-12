
use anchor_lang::prelude::*;
use anchor_spl::token::{
    self,
    Mint,
    Token,
    TokenAccount,
    Transfer,
};

declare_id!("GHwq3cme1Kfm8TAgTUatuNW8Aw9Mm5KgsWQW9zP3QagQ");

const SWAP_FEE_BPS: u16 = 30; // 0.30%

// ===========================================
// MIN SWAP SOLANA PROGRAM
// ===========================================

#[program]
pub mod minswap_solana {
    use super::*;

    // =======================================
    // 1. INITIALIZE LIQUIDITY POOL
    // =======================================

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        // Token mint addresses must be ordered.
        require!(
            ctx.accounts.token_a_mint.key().to_bytes()
                < ctx.accounts.token_b_mint.key().to_bytes(),
            MinSwapError::InvalidMintOrder
        );

        pool.authority = ctx.accounts.authority.key();

        pool.token_a_mint =
            ctx.accounts.token_a_mint.key();

        pool.token_b_mint =
            ctx.accounts.token_b_mint.key();

        pool.token_a_vault =
            ctx.accounts.token_a_vault.key();

        pool.token_b_vault =
            ctx.accounts.token_b_vault.key();

        pool.total_liquidity = 0;
        pool.fee_bps = SWAP_FEE_BPS;
        pool.bump = ctx.bumps.pool;

        msg!("MinSwap liquidity pool initialized");

        msg!("Token A: {}", pool.token_a_mint);
        msg!("Token B: {}", pool.token_b_mint);

        Ok(())
    }

    // =======================================
    // 2. ADD INITIAL LIQUIDITY
    // =======================================

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {

        // Both deposit amounts must be positive.
        require!(
            amount_a > 0 && amount_b > 0,
            MinSwapError::InvalidAmount
        );

        // Phase 3A supports an initial deposit only.
        // This prevents additional unaccounted
        // deposits before LP shares are implemented.
        require!(
            ctx.accounts.token_a_vault.amount == 0
                && ctx.accounts.token_b_vault.amount == 0
                && ctx.accounts.pool.total_liquidity == 0,
            MinSwapError::PoolAlreadyFunded
        );

        let token_program =
            ctx.accounts.token_program.to_account_info();

        // -----------------------------------
        // TRANSFER TOKEN A
        // -----------------------------------

        let transfer_a = Transfer {
            from: ctx.accounts
                .provider_token_a
                .to_account_info(),

            to: ctx.accounts
                .token_a_vault
                .to_account_info(),

            authority: ctx.accounts
                .provider
                .to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                token_program.clone(),
                transfer_a,
            ),
            amount_a,
        )?;

        // -----------------------------------
        // TRANSFER TOKEN B
        // -----------------------------------

        let transfer_b = Transfer {
            from: ctx.accounts
                .provider_token_b
                .to_account_info(),

            to: ctx.accounts
                .token_b_vault
                .to_account_info(),

            authority: ctx.accounts
                .provider
                .to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                token_program,
                transfer_b,
            ),
            amount_b,
        )?;

        msg!("Initial liquidity deposited");
        msg!("Token A amount: {}", amount_a);
        msg!("Token B amount: {}", amount_b);

        Ok(())
    }
}

// ===========================================
// 3. INITIALIZE POOL ACCOUNTS
// ===========================================

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
        seeds = [
            b"vault_a",
            pool.key().as_ref()
        ],
        bump,
        token::mint = token_a_mint,
        token::authority = pool
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        seeds = [
            b"vault_b",
            pool.key().as_ref()
        ],
        bump,
        token::mint = token_b_mint,
        token::authority = pool
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    pub rent: Sysvar<'info, Rent>,
}

// ===========================================
// 4. ADD LIQUIDITY ACCOUNTS
// ===========================================

#[derive(Accounts)]
pub struct AddLiquidity<'info> {

    #[account(mut)]
    pub provider: Signer<'info>,

    #[account(
        has_one = token_a_vault,
        has_one = token_b_vault,
        has_one = token_a_mint,
        has_one = token_b_mint
    )]
    pub pool: Account<'info, Pool>,

    pub token_a_mint: Account<'info, Mint>,

    pub token_b_mint: Account<'info, Mint>,

    // Provider owns source token A account.
    #[account(
        mut,
        constraint =
            provider_token_a.owner == provider.key(),
        constraint =
            provider_token_a.mint == pool.token_a_mint
    )]
    pub provider_token_a: Account<'info, TokenAccount>,

    // Provider owns source token B account.
    #[account(
        mut,
        constraint =
            provider_token_b.owner == provider.key(),
        constraint =
            provider_token_b.mint == pool.token_b_mint
    )]
    pub provider_token_b: Account<'info, TokenAccount>,

    // Vault A belongs to the pool PDA.
    #[account(
        mut,
        constraint =
            token_a_vault.owner == pool.key(),
        constraint =
            token_a_vault.mint == pool.token_a_mint
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    // Vault B belongs to the pool PDA.
    #[account(
        mut,
        constraint =
            token_b_vault.owner == pool.key(),
        constraint =
            token_b_vault.mint == pool.token_b_mint
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ===========================================
// 5. POOL DATA STRUCTURE
// ===========================================

#[account]
#[derive(InitSpace)]
pub struct Pool {

    // Pool creator
    pub authority: Pubkey,

    // Supported token mints
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,

    // SPL token vault accounts
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,

    // Reserved for future LP share accounting.
    // No LP tokens are minted in Phase 3A.
    pub total_liquidity: u64,

    // Trading fee in basis points
    pub fee_bps: u16,

    // Pool PDA bump
    pub bump: u8,
}

// ===========================================
// 6. CUSTOM ERRORS
// ===========================================

#[error_code]
pub enum MinSwapError {

    #[msg(
        "Token mints must be distinct and ordered"
    )]
    InvalidMintOrder,

    #[msg(
        "Both token amounts must be greater than zero"
    )]
    InvalidAmount,

    #[msg(
        "Initial liquidity has already been deposited"
    )]
    PoolAlreadyFunded,
}
