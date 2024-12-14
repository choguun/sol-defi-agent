import { Plugin } from "@ai16z/eliza";

import { Swap } from "./actions";

export const raydiumPlugin: Plugin = {
    name: "Raydium",
    description: "Raydium plugin",
    actions: [Swap],
    evaluators: [],
    providers: [],
}