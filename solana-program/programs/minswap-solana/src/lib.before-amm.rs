use anchor_lang::prelude::*;

declare_id!("GHwq3cme1Kfm8TAgTUatuNW8Aw9Mm5KgsWQW9zP3QagQ");

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
