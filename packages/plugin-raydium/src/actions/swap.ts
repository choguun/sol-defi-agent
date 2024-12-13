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

import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs from "bs58";
import RaydiumSwap from './raydium-swap';
import 'dotenv/config';
import { swapConfig } from './swap-config'; // Import the configuration

interface SwapContent {
    srcToken: string;
    dstToken: string;
    srcAmount: number;
    dstAmount: number;
}

const swapTemplate = ``;

export const Swap: Action = {
    name: "EXECUTE_SWAP",
    similes: ["SWAP_TOKENS", "TOKEN_SWAP", "TRADE_TOKENS"],
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

            await swap(runtime.getSetting("RPC_URL")!, runtime.getSetting("USER_WALLET_PRIVATE_KEY")!);

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

const swap = async (rpcUrl: string, privateKey: string) => {
    /**
     * The RaydiumSwap instance for handling swaps.
     */

    const raydiumSwap = new RaydiumSwap(rpcUrl, privateKey);
    console.log(`Raydium swap initialized`);
    console.log(`Swapping ${swapConfig.tokenAAmount} of ${swapConfig.tokenAAddress} for ${swapConfig.tokenBAddress}...`)
  
    /**
     * Load pool keys from the Raydium API to enable finding pool information.
     */
    await raydiumSwap.loadPoolKeys(swapConfig.liquidityFile);
    console.log(`Loaded pool keys`);
  
    /**
     * Find pool information for the given token pair.
     */
    const poolInfo = raydiumSwap.findPoolInfoForTokens(swapConfig.tokenAAddress, swapConfig.tokenBAddress);
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
      swapConfig.tokenBAddress,
      swapConfig.tokenAAmount,
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