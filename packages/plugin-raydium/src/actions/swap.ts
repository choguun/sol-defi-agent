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

import { Transaction, VersionedTransaction } from '@solana/web3.js';
import RaydiumSwap from './raydium-swap';
import { swapConfig } from './swap-config'; // Import the configuration

interface SwapContent {
    srcToken: string;
    destToken: string;
    amount: number;
}

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

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

Extract the following information about the requested token swap:
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

export const Swap: Action = {
    name: "SWAP_RAYDIUM",
    similes: ["EXECUTE_SWAP"],
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

            const content = await generateObject({
                runtime,
                context: composeContext({ state, template: swapTemplate }),
                modelClass: ModelClass.LARGE,
            }) as SwapContent;

            console.log(content);

            const tokenAAmount = content.amount;
            const tokenAAddress = content.srcToken;
            const tokenBAddress = content.destToken;

            console.log(`Swapping ${tokenAAmount} of ${tokenAAddress} for ${tokenBAddress}...`);

            await swap(tokenAAmount, tokenAAddress, tokenBAddress, runtime.getSetting("RPC_URL")!, runtime.getSetting("USER_WALLET_PRIVATE_KEY")!);

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
                    text: "Swap 1 SOL for USDC"
                }
            },
            {
                user: "{{user1}}",
                content: {
                    srcToken: "SOL",
                    destToken: "USDC",
                    amount: 1,
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Processing swap: 1 SOL -> USDC",
                    action: "EXECUTE_SWAP"
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swap complete! Transaction: [tx_hash]"
                }
            },
        ]
    ] as ActionExample[][]
};

const swap = async (TokenAAmount: number, tokenAAddress: string, tokenBAddress: string, rpcUrl: string, privateKey: string) => {
    /**
     * The RaydiumSwap instance for handling swaps.
     */

    const raydiumSwap = new RaydiumSwap(rpcUrl, privateKey);
    console.log(`Raydium swap initialized`);
    console.log(`Swapping ${TokenAAmount} of ${tokenAAddress} for ${tokenBAddress}...`)
  
    /**
     * Load pool keys from the Raydium API to enable finding pool information.
     */
    await raydiumSwap.loadPoolKeys(swapConfig.liquidityFile);
    console.log(`Loaded pool keys`);
  
    /**
     * Find pool information for the given token pair.
     */
    const poolInfo = raydiumSwap.findPoolInfoForTokens(tokenAAddress, tokenBAddress);
    if (!poolInfo) {
      console.error('Pool info not found');
      return 'Pool info not found';
    } else {
      console.log('Found pool info');
    }
  
    /**
     * Prepare the swap transaction with the given parameters.
     */
    const tx = await raydiumSwap.getSwapTransaction(
      tokenBAddress,
      TokenAAmount,
      poolInfo,
      swapConfig.maxLamports, 
      swapConfig.useVersionedTransaction,
      swapConfig.direction
    );
  
    /**
     * Depending on the configuration, execute or simulate the swap.
     */
    if (swapConfig.executeSwap) {
      /**
       * Send the transaction to the network and log the transaction ID.
       */
      const txid = swapConfig.useVersionedTransaction
        ? await raydiumSwap.sendVersionedTransaction(tx as VersionedTransaction, swapConfig.maxRetries)
        : await raydiumSwap.sendLegacyTransaction(tx as Transaction, swapConfig.maxRetries);

        console.log(`Swap complete!`);
        console.log(`https://solscan.io/tx/${txid}`);
    } else {
      /**
       * Simulate the transaction and log the result.
       */
      const simRes = swapConfig.useVersionedTransaction
        ? await raydiumSwap.simulateVersionedTransaction(tx as VersionedTransaction)
        : await raydiumSwap.simulateLegacyTransaction(tx as Transaction);
  
      console.log(simRes);
    }
};

export default Swap;
