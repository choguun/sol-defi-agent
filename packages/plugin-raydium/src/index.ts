import { Plugin } from "@ai16z/eliza";

import { Swap, AddLiquidity } from "./actions";

export const raydiumPlugin: Plugin = {
    name: "Raydium",
    description: "Raydium plugin",
    actions: [Swap, AddLiquidity],
    evaluators: [],
    providers: [],
}