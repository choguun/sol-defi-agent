export const swapConfig = {
    executeSwap: true, // Send tx when true, simulate tx when false
    useVersionedTransaction: true,
    maxLamports: 1500000, // Micro lamports for priority fee
    direction: "in" as "in" | "out", // Swap direction: 'in' or 'out'
    liquidityFile: "trimmed_mainnet.json",
    maxRetries: 20,
};