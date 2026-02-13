
 #!/usr/bin/env node

  /**
   * Swap tokens via Aerodrome (Safe + Zodiac Roles)
   * Improvements:
   * - Correct native ETH handling
   * - Correct cbBTC symbol handling
   * - Safer slippage/minOut integer math (bps)
   * - Chain/contract preflight checks
   * - Quote payload sanity checks
   * - Safer approval controls (exact/max + optional revoke)
   * - Optional pre-execution simulation
   *
   * Usage:
   *   node swap.js --from USDC --to ETH --amount 100 --execute

  import fs from 'fs'
  import path from 'path'
  import { fileURLToPath } from 'url'

  const __dirname = path.dirname(__filename)
  const DEFAULT_RPC_URL = 'https://mainnet.base.org'
  const CHAIN_ID = 8453
  const NATIVE_ETH = '0x0000000000000000000000000000000000000000'

  // TOKEN REGISTRY
  const TOKEN_REGISTRY = {
      ETH: { address: NATIVE_ETH, decimals: 18, native: true, display: 'ETH' },
      WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18, native: false, display: 'WETH' },
      USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, native: false, display: 'USDT' },
      DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, native: false, display: 'DAI' },
      USDS: { address: '0x820C137fa70C8691f0e44Dc420a5e53c168921Dc', decimals: 18, native: false, display: 'USDS' },
      AERO: { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, native: false, display: 'AERO' },
      VIRTUAL: { address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, native: false, display: 'VIRTUAL' },
      DEGEN: { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18, native: false, display: 'DEGEN' },
      BRETT: { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18, native: false, display: 'BRETT' },
      TOSHI: { address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', decimals: 18, native: false, display: 'TOSHI' },
      WELL: { address: '0xA88594D404727625A9437C3f886C7643872296AE', decimals: 18, native: false, display: 'WELL' },
      BID: { address: '0xa1832f7f4e534ae557f9b5ab76de54b1873e498b', decimals: 18, native: false, display: 'BID' },

      ETHEREUM: 'ETH',
      'USD COIN': 'USDC',
      TETHER: 'USDT',
      CBBTC: 'CBBTC',
      CBBTCTOKEN: 'CBBTC',
  }
  const PROTECTED_SYMBOLS = new Set(['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'USDS', 'AERO', 'CBBTC', 'BID'])

  // ============================================================================
  // ============================================================================
  const CONTRACTS = {
      AeroUniversalRouter: '0x6Df1c91424F79E40E33B1A48F0687B666bE71075',
      ZodiacHelpers: '0xc235D2475E4424F277B53D19724E2453a8686C54',
      WETH: '0x4200000000000000000000000000000000000006',
  }

  const ERC20_ABI = [
      'function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address, address) view returns (uint256)',
  ]

  const ROLES_ABI = [
      'function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) returns (bool)',

  const APPROVAL_HELPER_ABI = [
      'function approveForRouter(address token, uint256 amount) external',
      'function executeSwap(bytes commands, bytes[] inputs, uint256 deadline) external payable',
  ]
  // ============================================================================
  // HELPERS
  // ============================================================================
  function normalizeSymbol(input) {
      return input.trim().toUpperCase().replace(/^\$/, '')
  }

  function stripBom(input) {
      return input.replace(/^\uFEFF/, '')
  }
  function parseSlippageBps(value) {
      if (!Number.isFinite(value)) throw new Error('Invalid slippage')
      if (value < 0 || value > 0.5) throw new Error('Slippage must be between 0 and 0.5')
      return Math.round(value * 10000)
  }

  function formatSlippagePct(bps) {
      return (bps / 100).toFixed(2)
  }

  function formatAmount(amount, decimals, symbol) {
      const formatted = ethers.formatUnits(amount, decimals)
      const num = Number(formatted)
      if (!Number.isFinite(num)) return `${formatted} ${symbol}`
      if (num < 0.0001) return `${formatted} ${symbol}`
      return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`
  }

  function parseJsonSafe(text, label) {
      try {
          return JSON.parse(stripBom(text))
      } catch (error) {
          throw new Error(`Invalid JSON in ${label}: ${error.message}`)
      }
  }

  function requireHexData(data, label) {
      if (typeof data !== 'string' || !data.startsWith('0x') || (data.length % 2) !== 0) {
          throw new Error(`${label} must be valid hex data`)
      }
  }

  // ============================================================================
  // CONFIG / CLI
  // ============================================================================
  function loadConfig(configDir) {
      const configPath = path.join(configDir, 'wallet.json')
      if (!fs.existsSync(configPath)) {
          throw new Error(`Config not found: ${configPath}\nRun initialize.js first.`)
      }
      return parseJsonSafe(fs.readFileSync(configPath, 'utf8'), configPath)
  }

  function parseArgs() {
      const args = process.argv.slice(2)
      const result = {
          from: null,
          to: null,
          amount: null,
          configDir: process.env.WALLET_CONFIG_DIR || path.join(__dirname, '..', 'config'),
          rpc: process.env.BASE_RPC_URL || DEFAULT_RPC_URL,
          slippage: 0.05,
          execute: false,
          approveMode: 'exact', // exact | max
          revokeAfter: false,
          simulate: true,
      }

      for (let i = 0; i < args.length; i++) {
          switch (args[i]) {
              case '--from':
              case '-f':
                  result.from = args[++i]
              case '-t':
                  break
              case '--amount':
              case '-a':
                  break
              case '--slippage':
                  result.slippage = Number(args[++i])
                  break
              case '--execute':
              case '-x':
                  result.execute = true
                  break
              case '--approve-max':
                  result.approveMode = 'max'
                  break
              case '--approve-exact':
                  break
              case '--revoke-after':
                  result.revokeAfter = true
                  break
              case '--no-simulate':
                  result.simulate = false
              case '--config-dir':
              case '-c':
                  result.configDir = args[++i]
                  break
              case '--rpc':
              case '-r':
                  result.rpc = args[++i]
                  break
              case '-h':
                  printHelp()
                  process.exit(0)
                  throw new Error(`Unknown argument: ${args[i]}`)
          }
      }

      return result
  }

  function printHelp() {
      console.log(`

  Arguments:
    --from, -f         Token to swap from (symbol or address)
    --to, -t           Token to swap to (symbol or address)
    --amount, -a       Amount to swap
    --slippage         Slippage 0-0.5 (default: 0.05 = 5%)
    --execute, -x      Execute swap (default: quote only)
    --approve-exact    Approve exact amount only (default)
    --approve-max      Approve MaxUint256
    --no-simulate      Skip pre-execution eth_call simulation
    --config-dir, -c   Config directory
    --rpc, -r          RPC URL (default: ${DEFAULT_RPC_URL})

  Examples:
    node swap.js --from ETH --to USDC --amount 0.1
    node swap.js --from USDC --to ETH --amount 100 --execute --approve-max --revoke-after
  `)
  }

  // ============================================================================
  // TOKEN RESOLUTION
  async function resolveToken(input, provider) {
      if (token.startsWith('0x') && token.length === 42) {
          return resolveByAddress(token, provider)

      const symbolInput = normalizeSymbol(token)
      const key = TOKEN_ALIASES[symbolInput] || symbolInput
      const entry = TOKEN_REGISTRY[key]

      if (!entry) {
          if (PROTECTED_SYMBOLS.has(key)) {
              throw new Error(
                  `SECURITY: "${symbolInput}" is protected but no verified mapping exists.\n` +
              )
          }
          throw new Error(`Token "${symbolInput}" not found in verified list. Use contract address directly.`)

      if (entry.native) {
          return {
              address: entry.address,
              symbol: entry.display,
              verified: true,
              native: true,
          }
      }

      // Validate token contract metadata on chain for non-native entries
      const tokenContract = new ethers.Contract(entry.address, ERC20_ABI, provider)
      const [onChainSymbol, onChainDecimals] = await Promise.all([
          tokenContract.decimals(),
      ])

      return {
          address: entry.address,
          symbol: onChainSymbol || entry.display,
          decimals: Number(onChainDecimals),
          verified: true,
          native: false,
      }

  async function resolveByAddress(addressInput, provider) {
      const address = ethers.getAddress(addressInput)

      if (address.toLowerCase() === NATIVE_ETH.toLowerCase()) {
          return {
              address: NATIVE_ETH,
              symbol: 'ETH',
              decimals: 18,
              native: true,
          }
      }

      const verifiedEntry = Object.entries(TOKEN_REGISTRY).find(
          ([, entry]) => entry.address.toLowerCase() === address.toLowerCase()

      const tokenContract = new ethers.Contract(address, ERC20_ABI, provider)
      const [symbol, decimals] = await Promise.all([
          tokenContract.symbol(),
          tokenContract.decimals(),

      const result = {
          address,
          symbol,
          decimals: Number(decimals),
          native: false,
      }

      if (!verifiedEntry && PROTECTED_SYMBOLS.has(canonical)) {
          const expected = TOKEN_REGISTRY[canonical]?.address
          result.warning =
              `WARNING: token symbol "${symbol}" is protected but address does not match verified mapping.\n` +
              `Expected: ${expected || 'unknown'}\n` +
              `Provided: ${address}`
      }

      return result
  }

  // ============================================================================
  // PRE-FLIGHT
  // ============================================================================
      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)
      if (chainId !== CHAIN_ID) {
          throw new Error(`Wrong chain: got ${chainId}, expected ${CHAIN_ID} (Base mainnet)`)
      }

      const requiredAddresses = [
          { name: 'Safe', address: safeAddress },
          { name: 'Roles', address: config.roles },
          { name: 'AeroUniversalRouter', address: CONTRACTS.AeroUniversalRouter },
          { name: 'ZodiacHelpers', address: CONTRACTS.ZodiacHelpers },
      ]

          const code = await provider.getCode(item.address)
          if (!code || code === '0x') {
              throw new Error(`Missing contract bytecode at ${item.name}: ${item.address}`)
      }
  }

  // ============================================================================
  // QUOTE / VALIDATION
  // ============================================================================
  const QUOTE_API_URL = process.env.QUOTE_API_URL || 'https://we-395242cd474c4e0f8b93ca567e0b58ce.ecs.eu-central-1.on.aws/'
  async function getQuote(tokenIn, tokenOut, amountIn, safeAddress, slippageBps) {
      const response = await fetch(`${QUOTE_API_URL}/quote`, {
          method: 'POST',
          body: JSON.stringify({
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              amountIn: amountIn.toString(),
              recipient: safeAddress,
              slippage,
              chainId: String(CHAIN_ID),
          }),
      })

      const data = parseJsonSafe(body, 'quote API response')

          throw new Error(data.error || `Quote failed (${response.status})`)
      }

      return {
          amountOut: BigInt(data.quote),
          minAmountOut: data.minAmountOut ? BigInt(data.minAmountOut) : null,
          calldata: data.calldata,
      }
  }

  function validateQuotePayload({ quote, amountIn, safeAddress, isETHIn }) {
      if (!quote) throw new Error('Quote is missing')
      requireHexData(quote.calldata, 'quote.calldata')
      const ethValue = quote.value || 0n
      if (!isETHIn && ethValue !== 0n) {
          throw new Error(`Unsafe quote: ERC20-in swap returned non-zero ETH value (${ethValue})`)
      }
      if (isETHIn && ethValue > amountIn) {
          throw new Error(`Unsafe quote: ETH value (${ethValue}) exceeds amountIn (${amountIn})`)
      }
          throw new Error('Invalid Safe recipient address')

  // ============================================================================
  // EXECUTION HELPERS
  // ============================================================================
      provider,
      safeAddress,
      tokenIn,
      amountIn,
      roleKey,
      approveMode,
  }) {
      if (tokenIn.native) return

      const tokenContract = new ethers.Contract(tokenIn.address, ERC20_ABI, provider)
      let allowance = 0n
      try {
          allowance = await tokenContract.allowance(safeAddress, CONTRACTS.AeroUniversalRouter)
      } catch {
          allowance = 0n
      }
      if (allowance >= amountIn) return

      const approvalAmount = approveMode === 'max' ? ethers.MaxUint256 : amountIn
      const approvalInterface = new ethers.Interface(APPROVAL_HELPER_ABI)
      const approveData = approvalInterface.encodeFunctionData('approveForRouter', [
          approvalAmount,
      ])

      const tx = await roles.execTransactionWithRole(
          CONTRACTS.ZodiacHelpers,
          0n,
          approveData,
          1,
          roleKey,
          true
      )
      await tx.wait()
  }

  async function revokeAllowance({
      tokenIn,
      roleKey,
  }) {
      if (tokenIn.native) return

      const revokeData = approvalInterface.encodeFunctionData('approveForRouter', [
          tokenIn.address,
          0n,

      const tx = await roles.execTransactionWithRole(
          0n,
          revokeData,
          roleKey,
      )
      await tx.wait()
  }

      roles,
      to,
      data,
  }) {
      try {
          await roles.execTransactionWithRole.staticCall(
              to,
              value,
              data,
              1,
              roleKey,
          )
      } catch (error) {
          const msg = error?.shortMessage || error?.reason || error?.message || 'simulation failed'
      }
  }

  // ============================================================================
  // MAIN
  // ============================================================================
  async function main() {

          throw new Error('--from, --to, and --amount are required')
      }

      const slippageBps = parseSlippageBps(args.slippage)
      const config = loadConfig(args.configDir)

      const provider = new ethers.JsonRpcProvider(args.rpc)

      await preflight(provider, config, safeAddress)

      let tokenIn
      tokenIn = await resolveToken(args.from, provider)
      tokenOut = await resolveToken(args.to, provider)

      if (tokenIn.warning) console.log(tokenIn.warning)
      if (tokenOut.warning) console.log(tokenOut.warning)


      // Balance check
      if (tokenIn.native) {
          balance = await provider.getBalance(safeAddress)
      } else {
          const inContract = new ethers.Contract(tokenIn.address, ERC20_ABI, provider)
          balance = await inContract.balanceOf(safeAddress)
      }

          throw new Error(`Insufficient balance. Have ${formatAmount(balance, tokenIn.decimals, tokenIn.symbol)}`)
      }

      const quote = await getQuote(tokenIn, tokenOut, amountIn, safeAddress, slippageBps)
      validateQuotePayload({
          amountIn,
          safeAddress,
          isETHIn: tokenIn.native,
      })

      const minAmountOut = quote.minAmountOut || ((quote.amountOut * BigInt(10000 - slippageBps)) / 10000n)

      console.log('-------------------------------------------------------')
      console.log('SWAP SUMMARY')
      console.log(`Pay:         ${formatAmount(amountIn, tokenIn.decimals, tokenIn.symbol)}`)
      console.log(`Route:       ${quote.isMultiHop ? `${tokenIn.symbol} -> ... -> ${tokenOut.symbol}` : `${tokenIn.symbol} -> ${tokenOut.symbol}`}`)
      console.log('-------------------------------------------------------')

      if (!args.execute) {
          console.log('Quote only. Add --execute to perform swap.')
          return
      }
      const agentPkPath = path.join(args.configDir, 'agent.pk')
      if (!fs.existsSync(agentPkPath)) {
          throw new Error('Agent private key not found')
      }
      let privateKey = fs.readFileSync(agentPkPath, 'utf8').trim()
      if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey

      const wallet = new ethers.Wallet(privateKey, provider)

      // Build executeSwap calldata for ZodiacHelpers delegatecall
      let swapCalldata = quote.calldata
      if (swapCalldata.startsWith('0x3593564c')) {
          // UniversalRouter.execute -> ZodiacHelpers.executeSwap selector rewrite
          swapCalldata = '0xf23674e8' + swapCalldata.slice(10)
      }
      requireHexData(swapCalldata, 'swapCalldata')

      const ethValue = tokenIn.native ? amountIn : 0n
      if ((quote.value || 0n) > 0n && tokenIn.native) {
          // Keep quote-provided value if present but never exceed amountIn (already validated)
          // and never allow non-zero for ERC20-in (already validated)
      }

      await maybeApprove({
          roles,
          provider,
          safeAddress,
          tokenIn,
          amountIn,
          roleKey: config.roleKey,
          approveMode: args.approveMode,
      })

          await simulateExecution({
              roles,
              to: CONTRACTS.ZodiacHelpers,
              value: ethValue,
              data: swapCalldata,
              roleKey: config.roleKey,
          })
      }

      const tx = await roles.execTransactionWithRole(
          CONTRACTS.ZodiacHelpers,
          ethValue,
          swapCalldata,
          1,
          config.roleKey,
          true
      )

      console.log(`Submitted tx: ${tx.hash}`)
      const receipt = await tx.wait()
      if (receipt.status !== 1) {
          throw new Error('Swap transaction failed')
      }

      if (args.revokeAfter) {
          await revokeAllowance({
              roles,
              tokenIn,
              roleKey: config.roleKey,
          })
          console.log('Allowance revoked after swap.')
      }

      let newOutBalance
      if (tokenOut.native) {
          newOutBalance = await provider.getBalance(safeAddress)
      } else {
          const outContract = new ethers.Contract(tokenOut.address, ERC20_ABI, provider)
          newOutBalance = await outContract.balanceOf(safeAddress)
      }

      console.log('Swap complete')
      console.log(`New ${tokenOut.symbol} balance: ${formatAmount(newOutBalance, tokenOut.decimals, tokenOut.symbol)}`)
      console.log(`Tx: ${tx.hash}`)
  }

  main().catch((error) => {
      console.error(`Error: ${error.message}`)
      process.exit(1)
  })
#!/usr/bin/env node

/**
 * Swap tokens via CoW Protocol (via Safe + Zodiac Roles)
 *
 * Uses CoW Protocol's presign flow for MEV-protected swaps.
 * CoW batches orders and finds optimal execution paths, protecting
 * against sandwich attacks and other MEV extraction.
 *
 * Features:
 * - Resolves token symbols to addresses
 * - Safeguards for common tokens (ETH, USDC, USDT, etc.)
 * - Auto-substitutes ETH with WETH (CoW requires ERC20s)
 * - Gets quote before execution
 * - Presigns orders via Zodiac Roles delegatecall
 * - Polls order status until filled
 *
 * Usage:
 *   node swap.js --from ETH --to USDC --amount 0.1
 *   node swap.js --from USDC --to ETH --amount 100 --execute
 *
 * ETH is auto-wrapped to WETH when needed (CoW requires ERC20s)
 */

import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { VERIFIED_TOKENS, ERC20_ABI, resolveToken } from './tokens.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_RPC_URL = 'https://mainnet.base.org'

// Contracts
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
const NATIVE_ETH = '0x0000000000000000000000000000000000000000'

// CoW Protocol constants
const COW_API_BASE = 'https://api.cow.fi/base'
const COW_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41'
const COW_VAULT_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110'

// bytes32 keccak hashes for order struct fields
const KIND_SELL = '0xf3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee346775'
const KIND_BUY = '0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc'
const BALANCE_ERC20 = '0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9'

// ABIs
const ROLES_ABI = [
    'function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) returns (bool)',
]

const COW_PRESIGN_ABI = [
    'function cowPreSign(tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes orderUid) external',
]

const ZODIAC_HELPERS_ABI = [
    'function wrapETH(uint256 amount) external',
    'function unwrapWETH(uint256 amount) external',
]

// ============================================================================
// COW PROTOCOL API
// ============================================================================

async function getCowQuote(sellToken, buyToken, sellAmount, safeAddress) {
    const response = await fetch(`${COW_API_BASE}/api/v1/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sellToken: sellToken.address,
            buyToken: buyToken.address,
            from: safeAddress,
            receiver: safeAddress,
            sellAmountBeforeFee: sellAmount.toString(),
            kind: 'sell',
            signingScheme: 'presign',
            sellTokenBalance: 'erc20',
            buyTokenBalance: 'erc20',
        }),
    })

    const data = await response.json()

    if (!response.ok) {
        const errorMsg = data.description || data.errorType || JSON.stringify(data)
        throw new Error(`CoW quote failed: ${errorMsg}`)
    }

    return data
}

async function buildAppData(slippageBips) {
    const doc = {
        appCode: "Clawlett",
        environment: "production",
        metadata: {
            orderClass: { orderClass: "market" },
            quote: { slippageBips, smartSlippage: true },
            partnerFee: {
                bps: 50,
                recipient: "0xCB52B32D872e496fccb84CeD21719EC9C560dFd4",
            },
        },
        version: "1.14.0",
    }

    const fullAppData = JSON.stringify(doc)
    const appDataHash = ethers.keccak256(ethers.toUtf8Bytes(fullAppData))

    // Register with CoW so solvers can resolve the hash
    await fetch(`${COW_API_BASE}/api/v1/app_data/${appDataHash}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullAppData }),
    }).catch(() => {}) // non-critical

    return appDataHash
}

async function submitCowOrder(quoteResponse, safeAddress, timeoutSeconds) {
    const q = quoteResponse.quote

    // Default 30 minutes — matches CoW FE. Solvers need time to batch orders.
    const validTo = Math.floor(Date.now() / 1000) + (timeoutSeconds || 1800)

    // Smart slippage (based on CoW FE, more aggressive for small orders):
    //   1. Fee-based:   150% of feeAmount (dominates small orders → wider tolerance)
    //   2. Volume-based: 0.5% of sellAmount (dominates large orders → ~0.5%)
    const feeSlippage = BigInt(q.feeAmount) * 3n / 2n
    const volumeSlippage = BigInt(q.sellAmount) * 5n / 1000n
    const totalSlippage = feeSlippage + volumeSlippage
    // Convert sell-token slippage to buy-token: slippage * buyAmount / sellAmount
    const buySlippage = BigInt(q.sellAmount) > 0n
        ? totalSlippage * BigInt(q.buyAmount) / BigInt(q.sellAmount)
        : BigInt(q.buyAmount) * 5n / 1000n
    const discountedBuyAmount = (BigInt(q.buyAmount) - buySlippage).toString()

    // Build appData with slippage metadata (matches CoW FE)
    const slippageBips = Number(buySlippage * 10000n / BigInt(q.buyAmount))
    const appData = await buildAppData(slippageBips)

    const order = {
        sellToken: q.sellToken,
        buyToken: q.buyToken,
        receiver: q.receiver || safeAddress,
        sellAmount: q.sellAmount,
        buyAmount: discountedBuyAmount,
        validTo,
        appData,
        feeAmount: "0",
        kind: q.kind,
        partiallyFillable: q.partiallyFillable || false,
        sellTokenBalance: q.sellTokenBalance || 'erc20',
        buyTokenBalance: q.buyTokenBalance || 'erc20',
        signingScheme: 'presign',
        signature: safeAddress,
        from: safeAddress,
    }

    const response = await fetch(`${COW_API_BASE}/api/v1/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
    })

    const data = await response.json()

    if (!response.ok) {
        const errorMsg = data.description || data.errorType || JSON.stringify(data)
        throw new Error(`CoW order submission failed: ${errorMsg}`)
    }

    // data is the orderUid string
    return { orderUid: data, order }
}

function kindToBytes32(kind) {
    switch (kind) {
        case 'sell': return KIND_SELL
        case 'buy': return KIND_BUY
        default: throw new Error(`Unknown order kind: ${kind}`)
    }
}

function balanceToBytes32(balance) {
    switch (balance) {
        case 'erc20': return BALANCE_ERC20
        default: throw new Error(`Unknown balance type: ${balance}`)
    }
}

async function pollOrderStatus(orderUid, timeoutMs) {
    const startTime = Date.now()
    const pollInterval = 5000

    while (Date.now() - startTime < timeoutMs) {
        const response = await fetch(`${COW_API_BASE}/api/v1/orders/${orderUid}`)

        if (response.ok) {
            const order = await response.json()
            const status = order.status

            if (status === 'fulfilled') {
                return { status: 'fulfilled', order }
            } else if (status === 'expired') {
                return { status: 'expired', order }
            } else if (status === 'cancelled') {
                return { status: 'cancelled', order }
            }

            // presignaturePending or open - keep polling
            const elapsed = Math.round((Date.now() - startTime) / 1000)
            console.log(`   Status: ${status} (${elapsed}s elapsed)`)
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    return { status: 'timeout' }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatAmount(amount, decimals, symbol) {
    const formatted = ethers.formatUnits(amount, decimals)
    const num = parseFloat(formatted)
    if (num < 0.01) return `${formatted} ${symbol}`
    return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`
}

function loadConfig(configDir) {
    const configPath = path.join(configDir, 'wallet.json')
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config not found: ${configPath}\nRun initialize.js first.`)
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function parseArgs() {
    const args = process.argv.slice(2)
    const result = {
        from: null,
        to: null,
        amount: null,
        configDir: process.env.WALLET_CONFIG_DIR || path.join(__dirname, '..', 'config'),
        rpc: process.env.BASE_RPC_URL || DEFAULT_RPC_URL,
        slippage: 0.05,
        execute: false,
        timeout: 1800, // 30 minutes default (matches CoW FE)
    }

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--from':
            case '-f':
                result.from = args[++i]
                break
            case '--to':
            case '-t':
                result.to = args[++i]
                break
            case '--amount':
            case '-a':
                result.amount = args[++i]
                break
            case '--slippage':
                result.slippage = parseFloat(args[++i])
                break
            case '--execute':
            case '-x':
                result.execute = true
                break
            case '--timeout':
                result.timeout = parseInt(args[++i])
                break
            case '--config-dir':
            case '-c':
                result.configDir = args[++i]
                break
            case '--rpc':
            case '-r':
                result.rpc = args[++i]
                break
            case '--help':
            case '-h':
                printHelp()
                process.exit(0)
        }
    }

    return result
}

function printHelp() {
    console.log(`
Usage: node swap.js --from <TOKEN> --to <TOKEN> --amount <AMOUNT> [--execute]

Swap tokens via CoW Protocol (MEV-protected).

Arguments:
  --from, -f       Token to swap from (symbol or address)
  --to, -t         Token to swap to (symbol or address)
  --amount, -a     Amount to swap
  --slippage       Slippage 0-0.5 (default: 0.05 = 5%)
  --execute, -x    Execute swap (default: quote only)
  --timeout        Order timeout in seconds (default: 1800 = 30min)
  --config-dir, -c Config directory
  --rpc, -r        RPC URL (default: ${DEFAULT_RPC_URL})

Notes:
  - CoW Protocol only works with ERC20 tokens. ETH is auto-wrapped to WETH.
  - Orders are MEV-protected (no sandwich attacks).

Verified Tokens:
  ETH, WETH, USDC, USDT, DAI, USDS, AERO, cbBTC, VIRTUAL, DEGEN, BRETT, TOSHI, WELL
  Other tokens are searched via DexScreener (Base pairs).
  Unverified tokens show a warning with contract address, volume, and liquidity.

Examples:
  node swap.js --from ETH --to USDC --amount 0.1
  node swap.js --from USDC --to WETH --amount 100 --execute
  node swap.js --from USDC --to DAI --amount 50 --execute --timeout 600
`)
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const args = parseArgs()

    if (!args.from || !args.to || !args.amount) {
        console.error('Error: --from, --to, and --amount are required')
        printHelp()
        process.exit(1)
    }

    let config
    try {
        config = loadConfig(args.configDir)
    } catch (error) {
        console.error(`Error: ${error.message}`)
        process.exit(1)
    }

    const provider = new ethers.JsonRpcProvider(args.rpc)
    const safeAddress = config.safe

    console.log('\nResolving tokens...\n')

    let tokenIn, tokenOut
    try {
        tokenIn = await resolveToken(args.from, provider)
    } catch (error) {
        console.error(`\n${error.message}`)
        process.exit(1)
    }

    try {
        tokenOut = await resolveToken(args.to, provider)
    } catch (error) {
        console.error(`\n${error.message}`)
        process.exit(1)
    }

    // CoW Protocol only works with ERC20s - substitute ETH with WETH
    let ethSubstituted = false
    if (tokenIn.address.toLowerCase() === NATIVE_ETH) {
        console.log('Note: CoW Protocol requires ERC20 tokens. Using WETH instead of ETH.')
        tokenIn = { ...tokenIn, address: WETH_ADDRESS, symbol: 'WETH' }
        ethSubstituted = true
    }
    if (tokenOut.address.toLowerCase() === NATIVE_ETH) {
        console.log('Note: CoW Protocol requires ERC20 tokens. Receiving WETH instead of ETH.')
        tokenOut = { ...tokenOut, address: WETH_ADDRESS, symbol: 'WETH' }
        ethSubstituted = true
    }

    console.log(`From: ${tokenIn.symbol} ${tokenIn.verified ? '(verified)' : '(unverified)'}`)
    console.log(`      ${tokenIn.address}`)
    if (tokenIn.warning) console.log(`\n${tokenIn.warning}\n`)

    console.log(`To:   ${tokenOut.symbol} ${tokenOut.verified ? '(verified)' : '(unverified)'}`)
    console.log(`      ${tokenOut.address}`)
    if (tokenOut.warning) console.log(`\n${tokenOut.warning}\n`)

    const amountIn = ethers.parseUnits(args.amount, tokenIn.decimals)
    console.log(`\nAmount: ${formatAmount(amountIn, tokenIn.decimals, tokenIn.symbol)}`)

    // Check balance — when selling ETH via CoW, check both ETH and WETH
    let balance
    let wrapAmount = 0n
    if (ethSubstituted && tokenIn.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider)
        const wethBalance = await wethContract.balanceOf(safeAddress)
        const ethBalance = await provider.getBalance(safeAddress)

        console.log(`Safe WETH balance: ${formatAmount(wethBalance, 18, 'WETH')}`)
        console.log(`Safe ETH balance:  ${formatAmount(ethBalance, 18, 'ETH')}`)

        if (wethBalance >= amountIn) {
            balance = wethBalance
        } else if (wethBalance + ethBalance >= amountIn) {
            wrapAmount = amountIn - wethBalance
            balance = amountIn // sufficient after wrapping
            console.log(`Will wrap ${formatAmount(wrapAmount, 18, 'ETH')} to WETH as part of the swap transaction`)
        } else {
            console.error(`\nInsufficient ETH + WETH balance in Safe`)
            console.error(`Need ${formatAmount(amountIn, 18, 'WETH')}, have ${formatAmount(wethBalance, 18, 'WETH')} + ${formatAmount(ethBalance, 18, 'ETH')}`)
            process.exit(1)
        }
    } else {
        const tokenContract = new ethers.Contract(tokenIn.address, ERC20_ABI, provider)
        balance = await tokenContract.balanceOf(safeAddress)
        console.log(`Safe balance: ${formatAmount(balance, tokenIn.decimals, tokenIn.symbol)}`)

        if (balance < amountIn) {
            console.error(`\nInsufficient ${tokenIn.symbol} balance in Safe`)
            process.exit(1)
        }
    }

    // Get CoW quote
    console.log('\nGetting CoW Protocol quote...\n')

    let quoteResponse
    try {
        quoteResponse = await getCowQuote(tokenIn, tokenOut, amountIn, safeAddress)
    } catch (error) {
        console.error(`${error.message}`)
        console.error(`\nTip: If CoW has no liquidity for this pair, try using the contract address directly.`)
        process.exit(1)
    }

    const q = quoteResponse.quote
    const sellAmount = BigInt(q.sellAmount)
    const buyAmount = BigInt(q.buyAmount)
    const feeAmount = BigInt(q.feeAmount)

    console.log('='.repeat(55))
    console.log('                    SWAP SUMMARY')
    console.log('='.repeat(55))
    console.log(`  You pay:      ${formatAmount(amountIn, tokenIn.decimals, tokenIn.symbol)}`)
    console.log(`  Fee:          ${formatAmount(feeAmount, tokenIn.decimals, tokenIn.symbol)}`)
    console.log(`  You sell:     ${formatAmount(sellAmount, tokenIn.decimals, tokenIn.symbol)} (after fee)`)
    // Smart slippage for display (same formula as submitCowOrder)
    const displayFeeSlippage = feeAmount * 3n / 2n
    const displayVolSlippage = sellAmount * 5n / 1000n
    const displayTotalSlippage = displayFeeSlippage + displayVolSlippage
    const displayBuySlippage = sellAmount > 0n
        ? displayTotalSlippage * buyAmount / sellAmount
        : buyAmount * 5n / 1000n
    const minReceive = buyAmount - displayBuySlippage
    const slippagePct = Number(displayBuySlippage * 10000n / buyAmount) / 100
    console.log(`  You receive:  ~${formatAmount(buyAmount, tokenOut.decimals, tokenOut.symbol)}`)
    console.log(`  Min receive:  ${formatAmount(minReceive, tokenOut.decimals, tokenOut.symbol)} (${slippagePct.toFixed(2)}% smart slippage)`)
    console.log(`  Expires in:   ${args.timeout}s`)
    if (wrapAmount > 0n) {
        console.log(`  ETH wrap:     ${formatAmount(wrapAmount, 18, 'ETH')} → WETH (bundled in tx)`)
    }
    console.log(`  MEV protected via CoW Protocol batch auction`)
    console.log('='.repeat(55))

    if (!args.execute) {
        console.log('\nQUOTE ONLY - Add --execute to perform the swap')
        console.log(`\nTo execute: node swap.js --from "${args.from}" --to "${args.to}" --amount ${args.amount} --execute`)
        process.exit(0)
    }

    // ========================================================================
    // EXECUTION
    // ========================================================================

    console.log('\nExecuting CoW Protocol swap...\n')

    const agentPkPath = path.join(args.configDir, 'agent.pk')
    if (!fs.existsSync(agentPkPath)) {
        console.error('Error: Agent private key not found')
        process.exit(1)
    }
    let privateKey = fs.readFileSync(agentPkPath, 'utf8').trim()
    if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey

    const wallet = new ethers.Wallet(privateKey, provider)
    const roles = new ethers.Contract(config.roles, ROLES_ABI, wallet)

    const zodiacHelpersAddress = config.contracts?.ZodiacHelpers
    if (!zodiacHelpersAddress) {
        console.error('Error: ZodiacHelpers address not found in config. Re-run initialize.js.')
        process.exit(1)
    }

    // Step 1: Submit order to CoW API (off-chain, needed to get orderUid for presign)
    console.log('Step 1: Submitting order to CoW Protocol...')
    let orderUid, order
    try {
        const result = await submitCowOrder(quoteResponse, safeAddress, args.timeout)
        orderUid = result.orderUid
        order = result.order
    } catch (error) {
        console.error(`${error.message}`)
        process.exit(1)
    }
    console.log(`   Order UID: ${orderUid}`)
    console.log(`   Explorer:  https://explorer.cow.fi/base/orders/${orderUid}`)

    // Step 2: Build on-chain operations (wrap + approve + presign) and execute
    // All operations are bundled into a single MultiSend transaction when multiple
    // steps are needed, saving gas and ensuring atomicity.
    console.log('\nStep 2: Executing on-chain operations...')

    const zodiacHelpersInterface = new ethers.Interface(ZODIAC_HELPERS_ABI)
    const cowPresignInterface = new ethers.Interface(COW_PRESIGN_ABI)
    const multiSendTxs = []

    // 2a: Wrap ETH → WETH if needed (user said ETH, CoW needs WETH)
    if (wrapAmount > 0n) {
        console.log(`   - Wrap ${formatAmount(wrapAmount, 18, 'ETH')} → WETH`)
        const wrapData = zodiacHelpersInterface.encodeFunctionData('wrapETH', [wrapAmount])
        multiSendTxs.push({ operation: 1, to: zodiacHelpersAddress, value: 0n, data: wrapData })
    }

    // 2b: Presign the order on-chain (must match submitted order exactly)
    console.log('   - Presign CoW order')
    const orderStruct = {
        sellToken: order.sellToken,
        buyToken: order.buyToken,
        receiver: order.receiver || safeAddress,
        sellAmount: BigInt(order.sellAmount),
        buyAmount: BigInt(order.buyAmount),
        validTo: order.validTo,
        appData: order.appData,
        feeAmount: 0n,
        kind: kindToBytes32(order.kind),
        partiallyFillable: order.partiallyFillable || false,
        sellTokenBalance: balanceToBytes32(order.sellTokenBalance || 'erc20'),
        buyTokenBalance: balanceToBytes32(order.buyTokenBalance || 'erc20'),
    }

    const presignData = cowPresignInterface.encodeFunctionData('cowPreSign', [
        orderStruct,
        orderUid,
    ])
    multiSendTxs.push({ operation: 1, to: zodiacHelpersAddress, value: 0n, data: presignData })

    // Execute each operation individually via Roles (ZodiacHelpers is the allowed target)
    for (let i = 0; i < multiSendTxs.length; i++) {
        const tx = multiSendTxs[i]
        console.log(`   Executing operation ${i + 1}/${multiSendTxs.length}...`)
        const onChainTx = await roles.execTransactionWithRole(
            tx.to,
            tx.value,
            tx.data,
            1, // delegatecall
            config.roleKey,
            true
        )
        console.log(`   Transaction: ${onChainTx.hash}`)
        const receipt = await onChainTx.wait()
        if (receipt.status !== 1) {
            console.error(`   Operation ${i + 1} failed!`)
            process.exit(1)
        }
    }
    const lastTxHash = multiSendTxs.length > 0 ? 'see above' : 'none'

    console.log('   All on-chain operations complete!')

    // Step 3: Poll order status
    console.log('\nStep 3: Waiting for order to be filled...')
    console.log(`   Timeout: ${args.timeout}s`)

    const result = await pollOrderStatus(orderUid, args.timeout * 1000)

    switch (result.status) {
        case 'fulfilled': {
            let newBalance
            const outContract = new ethers.Contract(tokenOut.address, ERC20_ABI, provider)
            newBalance = await outContract.balanceOf(safeAddress)

            console.log('\nSWAP COMPLETE')
            console.log(`   Sold: ${formatAmount(sellAmount, tokenIn.decimals, tokenIn.symbol)}`)
            console.log(`   Received: ~${formatAmount(buyAmount, tokenOut.decimals, tokenOut.symbol)}`)
            console.log(`   New ${tokenOut.symbol} balance: ${formatAmount(newBalance, tokenOut.decimals, tokenOut.symbol)}`)
            console.log(`   Explorer: https://explorer.cow.fi/base/orders/${orderUid}`)
            break
        }
        case 'expired':
            console.error('\nOrder expired without being filled.')
            console.error('Tip: Try again with a higher slippage tolerance.')
            process.exit(1)
            break
        case 'cancelled':
            console.error('\nOrder was cancelled.')
            process.exit(1)
            break
        case 'timeout':
            console.error(`\nTimed out after ${args.timeout}s. Order may still be filled.`)
            console.error(`Check status: https://explorer.cow.fi/base/orders/${orderUid}`)
            process.exit(1)
            break
    }
}

main().catch(error => {
    console.error(`\nError: ${error.message}`)
    process.exit(1)
})
