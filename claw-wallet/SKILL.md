# Claw Wallet

Secure token swaps via Aerodrome on Base, powered by Safe + Zodiac Roles.

## Overview

This skill enables autonomous token swaps through a Gnosis Safe. The agent operates through Zodiac Roles which restricts operations to:
- Swapping tokens via Aerodrome Router
- Approving tokens only for the Aerodrome Router
- Sending swapped tokens only back to the Safe (no draining)

## Capabilities

| Action | Autonomous | Notes |
|--------|------------|-------|
| Check balances | ✅ | ETH and any ERC20 |
| Get swap quote | ✅ | Via Aerodrome Router |
| Swap tokens | ✅ | Any pair with liquidity |
| Approve tokens | ✅ | Only for Aerodrome Router |
| Transfer funds | ❌ | Blocked by Roles |

## Token Safety

Protected tokens can ONLY resolve to verified addresses:

| Token | Verified Address |
|-------|-----------------|
| ETH/WETH | `0x4200000000000000000000000000000000000006` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDT | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |
| AERO | `0x940181a94A35A4569E4529A3CDfB74e38FD98631` |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |

If a scam token impersonates these symbols, the agent will detect and warn.

## Setup

1. Owner provides their wallet address
2. Agent generates keypair → **Owner sends 0.001 ETH** to agent for gas
3. Agent deploys Safe (owner as sole owner)
4. Agent deploys Zodiac Roles with Aerodrome permissions
5. Agent removes itself as Safe owner (keeps Roles access)
6. **Owner funds Safe** with tokens to trade

## Usage

### Initialize
```
Initialize my wallet with owner 0x123...
```

### Check Balance
```
What's my balance?
How much USDC do I have?
```

### Swap Tokens
```
Swap 0.1 ETH for USDC
Swap 100 USDC for ETH
Exchange 50 DAI to AERO
Trade my DEGEN for BRETT
```

The agent will:
1. Resolve token symbols (with scam protection)
2. Get quote from Aerodrome
3. Show swap details and ask for confirmation
4. Execute via Safe + Roles

## Scripts

| Script | Description |
|--------|-------------|
| `initialize.js` | Deploy Safe + Roles with Aerodrome permissions |
| `swap.js` | Swap tokens via Aerodrome |
| `balance.js` | Check ETH and token balances |

### Examples

```bash
# Initialize
node skills/wallet/scripts/initialize.js --owner 0x123...

# Check balance
node skills/wallet/scripts/balance.js
node skills/wallet/scripts/balance.js --token USDC

# Get swap quote
node skills/wallet/scripts/swap.js --from ETH --to USDC --amount 0.1

# Execute swap
node skills/wallet/scripts/swap.js --from ETH --to USDC --amount 0.1 --execute
```

## Configuration

Scripts read from `config/wallet.json`:

```json
{
  "chainId": 8453,
  "owner": "0x...",
  "agent": "0x...",
  "safe": "0x...",
  "roles": "0x...",
  "roleKey": "0x..."
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_RPC_URL` | `https://mainnet.base.org` | Base RPC endpoint |
| `WALLET_CONFIG_DIR` | `skills/wallet/config` | Config directory |

## Contracts

| Contract | Address | Description |
|----------|---------|-------------|
| Aerodrome Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` | DEX router |
| Aerodrome Factory | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` | Pool factory |
| ApprovalHelper | `0x55881791383A2ab8Fb6F98267419e83e074fd076` | Token approvals |
| Safe Singleton | `0x3E5c63644E683549055b9Be8653de26E0B4CD36E` | Safe L2 impl |
| Safe Factory | `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` | Safe deployer |
| Roles Singleton | `0x9646fDAD06d3e24444381f44362a3B0eB343D337` | Zodiac Roles |
| Module Factory | `0x000000000000aDdB49795b0f9bA5BC298cDda236` | Module deployer |

## Security Model

1. **Safe holds all funds** - Agent wallet only has gas
2. **Zodiac Roles restricts operations**:
   - Can only call Aerodrome Router swap functions
   - Swap `to` parameter scoped to Safe address only
   - Can only approve tokens for Aerodrome Router
3. **No transfer/withdraw** - Agent cannot move funds out
4. **Scam protection** - Common tokens resolve to verified addresses only
