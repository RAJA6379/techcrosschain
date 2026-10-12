
use anchor_lang::prelude::*;
use anchor_spl::token::{
    self, Burn, Mint, MintTo, Token, TokenAccount, Transfer,
};

declare_id!("GHwq3cme1Kfm8TAgTUatuNW8Aw9Mm5KgsWQW9zP3QagQ");

const SWAP_FEE_BPS: u16 = 30;

#[program]
pub mod minswap_solana {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        require!(
            ctx.accounts.token_a_mint.key().to_bytes()
                < ctx.accounts.token_b_mint.key().to_bytes(),
            MinSwapError::InvalidMintOrder
        );

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.token_a_vault = ctx.accounts.token_a_vault.key();
        pool.token_b_vault = ctx.accounts.token_b_vault.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.total_liquidity = 0;
        pool.fee_bps = SWAP_FEE_BPS;
        pool.bump = ctx.bumps.pool;

        msg!("MinSwap Phase 3B pool initialized");
        Ok(())
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a: u64,
        amount_b: u64,
        min_lp_out: u64,
    ) -> Result<()> {
        require!(
            amount_a > 0 && amount_b > 0,
            MinSwapError::InvalidAmount
        );

        let reserve_a = ctx.accounts.token_a_vault.amount;
        let reserve_b = ctx.accounts.token_b_vault.amount;
        let current_lp = ctx.accounts.pool.total_liquidity;

        let lp_to_mint = if current_lp == 0 {
            require!(
                reserve_a == 0 && reserve_b == 0,
                MinSwapError::InvalidReserves
            );

            let product = (amount_a as u128)
                .checked_mul(amount_b as u128)
                .ok_or(MinSwapError::MathOverflow)?;

            u64::try_from(integer_sqrt(product))
                .map_err(|_| error!(MinSwapError::MathOverflow))?
        } else {
            require!(
                reserve_a > 0 && reserve_b > 0,
                MinSwapError::InvalidReserves
            );

            // This phase accepts proportional additions only.
            require!(
                (amount_a as u128)
                    .checked_mul(reserve_b as u128)
                    .ok_or(MinSwapError::MathOverflow)?
                    ==
                (amount_b as u128)
                    .checked_mul(reserve_a as u128)
                    .ok_or(MinSwapError::MathOverflow)?,
                MinSwapError::InvalidDepositRatio
            );

            let shares_a = (amount_a as u128)
                .checked_mul(current_lp as u128)
                .ok_or(MinSwapError::MathOverflow)?
                / reserve_a as u128;

            let shares_b = (amount_b as u128)
                .checked_mul(current_lp as u128)
                .ok_or(MinSwapError::MathOverflow)?
                / reserve_b as u128;

            u64::try_from(shares_a.min(shares_b))
                .map_err(|_| error!(MinSwapError::MathOverflow))?
        };

        require!(lp_to_mint > 0, MinSwapError::InsufficientLp);
        require!(
            lp_to_mint >= min_lp_out,
            MinSwapError::SlippageExceeded
        );

        let next_total = current_lp
            .checked_add(lp_to_mint)
            .ok_or(MinSwapError::MathOverflow)?;

        let token_program = ctx.accounts.token_program.to_account_info();

        token::transfer(
            CpiContext::new(
                token_program.clone(),
                Transfer {
                    from: ctx.accounts.provider_token_a.to_account_info(),
                    to: ctx.accounts.token_a_vault.to_account_info(),
                    authority: ctx.accounts.provider.to_account_info(),
                },
            ),
            amount_a,
        )?;

        token::transfer(
            CpiContext::new(
                token_program.clone(),
                Transfer {
                    from: ctx.accounts.provider_token_b.to_account_info(),
                    to: ctx.accounts.token_b_vault.to_account_info(),
                    authority: ctx.accounts.provider.to_account_info(),
                },
            ),
            amount_b,
        )?;

        let mint_a = ctx.accounts.pool.token_a_mint;
        let mint_b = ctx.accounts.pool.token_b_mint;
        let bump = [ctx.accounts.pool.bump];

        let signer_seeds: &[&[u8]] = &[
            b"pool",
            mint_a.as_ref(),
            mint_b.as_ref(),
            &bump,
        ];

        token::mint_to(
            CpiContext::new_with_signer(
                token_program,
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.provider_lp.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[signer_seeds],
            ),
            lp_to_mint,
        )?;

        ctx.accounts.pool.total_liquidity = next_total;

        msg!("Liquidity added");
        msg!("LP tokens minted: {}", lp_to_mint);
        Ok(())
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_amount: u64,
        min_a_out: u64,
        min_b_out: u64,
    ) -> Result<()> {
        require!(lp_amount > 0, MinSwapError::InvalidAmount);

        let total_lp = ctx.accounts.pool.total_liquidity;

        require!(
            total_lp > 0 && lp_amount <= total_lp,
            MinSwapError::InsufficientLp
        );

        let reserve_a = ctx.accounts.token_a_vault.amount;
        let reserve_b = ctx.accounts.token_b_vault.amount;

        let amount_a = u64::try_from(
            (lp_amount as u128)
                .checked_mul(reserve_a as u128)
                .ok_or(MinSwapError::MathOverflow)?
                / total_lp as u128,
        )
        .map_err(|_| error!(MinSwapError::MathOverflow))?;

        let amount_b = u64::try_from(
            (lp_amount as u128)
                .checked_mul(reserve_b as u128)
                .ok_or(MinSwapError::MathOverflow)?
                / total_lp as u128,
        )
        .map_err(|_| error!(MinSwapError::MathOverflow))?;

        require!(
            amount_a > 0 && amount_b > 0,
            MinSwapError::InvalidAmount
        );

        require!(
            amount_a >= min_a_out && amount_b >= min_b_out,
            MinSwapError::SlippageExceeded
        );

        let next_total = total_lp
            .checked_sub(lp_amount)
            .ok_or(MinSwapError::MathOverflow)?;

        let token_program = ctx.accounts.token_program.to_account_info();

        // Burn the provider's LP tokens first.
        token::burn(
            CpiContext::new(
                token_program.clone(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.provider_lp.to_account_info(),
                    authority: ctx.accounts.provider.to_account_info(),
                },
            ),
            lp_amount,
        )?;

        let mint_a = ctx.accounts.pool.token_a_mint;
        let mint_b = ctx.accounts.pool.token_b_mint;
        let bump = [ctx.accounts.pool.bump];

        let signer_seeds: &[&[u8]] = &[
            b"pool",
            mint_a.as_ref(),
            mint_b.as_ref(),
            &bump,
        ];

        token::transfer(
            CpiContext::new_with_signer(
                token_program.clone(),
                Transfer {
                    from: ctx.accounts.token_a_vault.to_account_info(),
                    to: ctx.accounts.provider_token_a.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount_a,
        )?;

        token::transfer(
            CpiContext::new_with_signer(
                token_program,
                Transfer {
                    from: ctx.accounts.token_b_vault.to_account_info(),
                    to: ctx.accounts.provider_token_b.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount_b,
        )?;

        ctx.accounts.pool.total_liquidity = next_total;

        msg!("Liquidity removed");
        msg!("Token A returned: {}", amount_a);
        msg!("Token B returned: {}", amount_b);
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

    #[account(
        init,
        payer = authority,
        seeds = [b"lp_mint", pool.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = pool
    )]
    pub lp_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
#[account(
    mut,
    has_one = token_a_mint,
    has_one = token_b_mint,
    has_one = token_a_vault,
    has_one = token_b_vault,
    has_one = lp_mint
)]
pub pool: Account<'info, Pool>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = provider_token_a.owner == provider.key(),
        constraint = provider_token_a.mint == token_a_mint.key()
    )]
    pub provider_token_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = provider_token_b.owner == provider.key(),
        constraint = provider_token_b.mint == token_b_mint.key()
    )]
    pub provider_token_b: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_a_vault.owner == pool.key(),
        constraint = token_a_vault.mint == token_a_mint.key()
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_b_vault.owner == pool.key(),
        constraint = token_b_vault.mint == token_b_mint.key()
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = lp_mint.mint_authority
            == anchor_lang::solana_program::program_option::COption::Some(
                pool.key()
            )
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = provider_lp.owner == provider.key(),
        constraint = provider_lp.mint == lp_mint.key()
    )]
    pub provider_lp: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,

    #[account(
        mut,
        has_one = token_a_mint,
        has_one = token_b_mint,
        has_one = token_a_vault,
        has_one = token_b_vault,
        has_one = lp_mint
    )]
    pub pool: Account<'info, Pool>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = provider_token_a.owner == provider.key(),
        constraint = provider_token_a.mint == token_a_mint.key()
    )]
    pub provider_token_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = provider_token_b.owner == provider.key(),
        constraint = provider_token_b.mint == token_b_mint.key()
    )]
    pub provider_token_b: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_a_vault.owner == pool.key(),
        constraint = token_a_vault.mint == token_a_mint.key()
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = token_b_vault.owner == pool.key(),
        constraint = token_b_vault.mint == token_b_mint.key()
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = lp_mint.mint_authority
            == anchor_lang::solana_program::program_option::COption::Some(
                pool.key()
            )
    )]
    pub lp_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = provider_lp.owner == provider.key(),
        constraint = provider_lp.mint == lp_mint.key()
    )]
    pub provider_lp: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}


#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub total_liquidity: u64,
    pub fee_bps: u16,
    pub bump: u8,
}

#[error_code]
pub enum MinSwapError {
    #[msg("Token mints must be distinct and ordered")]
    InvalidMintOrder,

    #[msg("Both token amounts must be greater than zero")]
    InvalidAmount,

    #[msg("Pool reserves are inconsistent")]
    InvalidReserves,

    #[msg("Additional deposits must match the pool ratio")]
    InvalidDepositRatio,

    #[msg("Insufficient LP shares")]
    InsufficientLp,

    #[msg("Slippage limit exceeded")]
    SlippageExceeded,

    #[msg("Arithmetic overflow")]
    MathOverflow,
}

// Integer-only square root for initial LP-share calculation.
fn integer_sqrt(value: u128) -> u128 {
    if value == 0 {
        return 0;
    }

    let mut x = value;
    let mut y = (x + 1) / 2;

    while y < x {
        x = y;
        y = (x + value / x) / 2;
    }

    x
}
