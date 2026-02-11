
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
