import {
    ApiV3PoolInfoStandardItem,
    TokenAmount,
    toToken,
    Percent,
    AmmV4Keys,
    AmmV5Keys,
    printSimulate,
  } from '@raydium-io/raydium-sdk-v2'
  import { isValidAmm } from './utils'
  import Decimal from 'decimal.js'


  import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    ModelClass,
    composeContext,
    generateObject
} from "@ai16z/eliza";

import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'

export let owner: Keypair
export let connection: Connection
export const txVersion = TxVersion.V0 // or TxVersion.LEGACY
const cluster = 'mainnet' // 'mainnet' | 'devnet'
let raydium: Raydium | undefined

interface AddLiquidityContent {
    srcToken: string;
    destToken: string;
    amount: number;
}

const liquidityTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "srcToken": "So11111111111111111111111111111111111111112",
    "destToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "1",
}
\`\`\`

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token liquidity:
- srcToken (the token being sold)
- destToken (the token being bought)
- amount (the amount of the token being sold)

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined. The result should be a valid JSON object with the following schema:
\`\`\`json
{
    "srcToken": string | null,
    "destToken": string | null,
    "amount":  number | string | null
}
\`\`\``;


/*
   tokenAAmount: 0.001, // Swap 0.01 SOL for USDC in this example
   tokenAAddress: "So11111111111111111111111111111111111111112", // Token to swap for the other, SOL in this case
   tokenBAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC address
*/

export const AddLiquidity: Action = {
    name: "ADD_LIQUIDITY_RAYDIUM",
    similes: ["EXECUTE_ADD_LIQUIDITY"],
    validate: async (runtime: IAgentRuntime) => true,
    description: "Execute a token swap using Raydium",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            if (!state) {
                state = await runtime.composeState(message);
            } else {
                state = await runtime.updateRecentMessageState(state);
            }
            owner = Keypair.fromSecretKey(bs58.decode(runtime.getSetting("USER_WALLET_PRIVATE_KEY")!))
            connection = new Connection(runtime.getSetting("RPC_URL")!)

            const content = await generateObject({
                runtime,
                context: composeContext({ state, template: liquidityTemplate }),
                modelClass: ModelClass.LARGE,
            }) as AddLiquidityContent;

            console.log(content);

            const tokenAAmount = content.amount;
            const tokenAAddress = content.srcToken;
            const tokenBAddress = content.destToken;

            console.log(`Adding liquidity ${tokenAAmount} of ${tokenAAddress} for ${tokenBAddress}...`);

            await addLiquidity();

        } catch (error) {
            console.error("Swap error:", error);
            callback?.({ text: `Error: ${error.message}` });
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Provide SOL/USDC liquidity"
                }
            },
            {
              user: "{{user1}}",
              content: {
                  text: "Add SOL/USDC liquidity"
              }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Processing add liquidity",
                    action: "EXECUTE_ADD_LIQUIDITY"
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Add liquidity complete! Transaction: [tx_hash]"
                }
            },
        ]
    ] as ActionExample[][]
};
  
const addLiquidity = async () => {
  const raydium = await initSdk()

  // SOL-USDC pool
  const poolId = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'
  // RAY-USDC pool
  // const poolId = '6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg' // 6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg
  let poolKeys: AmmV4Keys | AmmV5Keys | undefined
  let poolInfo: ApiV3PoolInfoStandardItem

  if (raydium.cluster === 'mainnet') {
    // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
    // if you wish to get pool info from rpc, also can modify logic to go rpc method directly
    const data = await raydium.api.fetchPoolById({ ids: poolId })
    poolInfo = data[0] as ApiV3PoolInfoStandardItem
  } else {
    // note: getPoolInfoFromRpc method only return required pool data for computing not all detail pool info
    const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId })
    poolInfo = data.poolInfo
    poolKeys = data.poolKeys
  }

  if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')

  const inputAmount = '0.0001'

  const r = raydium.liquidity.computePairAmount({
    poolInfo,
    amount: inputAmount,
    baseIn: true,
    slippage: new Percent(1, 100), // 1%
  })

  const { execute, transaction } = await raydium.liquidity.addLiquidity({
    poolInfo,
    poolKeys,
    amountInA: new TokenAmount(
      toToken(poolInfo.mintA),
      new Decimal(inputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
    ),
    amountInB: new TokenAmount(
      toToken(poolInfo.mintB),
      new Decimal(r.maxAnotherAmount.toExact()).mul(10 ** poolInfo.mintB.decimals).toFixed(0)
    ),
    otherAmountMin: r.minAnotherAmount,
    fixedSide: 'a',
    txVersion,
    // optional: set up priority fee here
    // computeBudgetConfig: {
    //   units: 600000,
    //   microLamports: 46591500,
    // },
  })

  // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
  const { txId } = await execute({ sendAndConfirm: true })
  console.log('liquidity added:', { txId: `https://explorer.solana.com/tx/${txId}` })
  // process.exit() // if you don't want to end up node execution, comment this line
}

export const initSdk = async (params?: { loadToken?: boolean }) => {
  if (raydium) return raydium
  if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta'))
    console.warn('using free rpc node might cause unexpected error, strongly suggest uses paid rpc node')
  console.log(`connect to rpc ${connection.rpcEndpoint} in ${cluster}`)
  raydium = await Raydium.load({
    owner,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: 'finalized',
  })

  return raydium
}

export default AddLiquidity;