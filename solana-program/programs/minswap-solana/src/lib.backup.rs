use anchor_lang::prelude::*;

declare_id!("4gyiCQ5dLvGmeKZ3GHjqnGf3RHtMfFNi5c2vsD9C7TPo");

#[program]
pub mod minswap_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
