## Sol DeFi Agent

Vision: DeFi AI Agent for Solana ecosystem

**Problems in Current DeFi Ecosystems**
1. Fragmented User Experience
Users often navigate between multiple platforms for staking, lending, liquidity provision, and yield farming, leading to inefficiency.

1. Lack of Personalized Financial Management
Most DeFi platforms provide generic financial services, lacking tailored solutions or strategies for individual users.

1. Inefficient Liquidity Management
Users struggle to maximize liquidity utilization across multiple protocols, often leaving capital underutilized.

1. Barriers for New Users
Complex interfaces, jargon-heavy processes, and lack of guidance deter new entrants from engaging in DeFi.

1. Market Volatility and Risk Management
Users lack tools to monitor risk exposure dynamically and rebalance their portfolios during volatile market conditions.

**Solution**
A smart, personalized AI-driven financial assistant integrated with Solana DeFi protocols. This agent offers users seamless, automated, and strategic DeFi interactions.

**Core Features**
1. AI-Powered Portfolio Optimization

2. Tailored yield strategies based on user goals (e.g., risk tolerance, desired returns).
Automated rebalancing across Raydium, Solend, and other Solana-based protocols.
Intelligent Liquidity Allocation

3. Analyzes market conditions to optimize liquidity deployment for farming, lending, or staking.
Provides real-time suggestions for underutilized capital.
Risk Management Tools

4. Dynamic monitoring of liquidation risks for leveraged positions.
AI alerts and automated adjustments to mitigate losses during market downturns.
User-Friendly Interfaces

**How to use**
```
pnpm install
cp .env.example .env
pnpm bulid:package
pnpm start
```

- `GAIANET_MODEL`: 🤖

  1. Visit https://docs.gaianet.ai/user-guide/nodes
  2. Choose your model (default: llama)
  3. Copy the model name

- `GAIANET_SERVER_URL`: 🌐

  1. Visit https://docs.gaianet.ai/user-guide/nodes
  2. Get server URL for your chosen model
  3. Default: https://llama8b.gaia.domains/v1

- `GAIANET_EMBEDDING_MODEL`: 🧬

  1. Visit https://docs.gaianet.ai/user-guide/nodes
  2. Choose embedding model (default: nomic-embed)
  3. Copy the model name

- `USE_GAIANET_EMBEDDING`: ⚙️

  1. Set to TRUE to enable Gaianet embeddings
  2. Set to FALSE to disable (default: TRUE)
