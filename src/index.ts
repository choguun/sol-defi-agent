import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { DirectClientInterface } from "@ai16z/client-direct";
import { DiscordClientInterface } from "@ai16z/client-discord";
import { AutoClientInterface } from "@ai16z/client-auto";
import { TelegramClientInterface } from "@ai16z/client-telegram";
import { TwitterClientInterface } from "@ai16z/client-twitter";
import {
  DbCacheAdapter,
  defaultCharacter,
  FsCacheAdapter,
  ICacheManager,
  IDatabaseCacheAdapter,
  stringToUuid,
  AgentRuntime,
  CacheManager,
  Character,
  IAgentRuntime,
  ModelProviderName,
  elizaLogger,
  settings,
  IDatabaseAdapter,
  validateCharacterConfig,
} from "@ai16z/eliza";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
import { solanaPlugin } from "@ai16z/plugin-solana";
import Database from "better-sqlite3";
import fs from "fs";
import readline from "readline";
import yargs from "yargs";
import path from "path";
import { fileURLToPath } from "url";
import { character } from "./character.ts";
import type { DirectClient } from "@ai16z/client-direct";
import { promises as fsPromises } from 'fs';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

interface UserProfile {
  riskTolerance: 'low' | 'medium' | 'high';
  firstTime: boolean;
}

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export function parseArguments(): {
  character?: string;
  characters?: string;
} {
  try {
    return yargs(process.argv.slice(2))
      .option("character", {
        type: "string",
        description: "Path to the character JSON file",
      })
      .option("characters", {
        type: "string",
        description: "Comma separated list of paths to character JSON files",
      })
      .parseSync();
  } catch (error) {
    console.error("Error parsing arguments:", error);
    return {};
  }
}

export async function loadCharacters(
  charactersArg: string
): Promise<Character[]> {
  let characterPaths = charactersArg?.split(",").map((filePath) => {
    if (path.basename(filePath) === filePath) {
      filePath = "../characters/" + filePath;
    }
    return path.resolve(process.cwd(), filePath.trim());
  });

  const loadedCharacters = [];

  if (characterPaths?.length > 0) {
    for (const path of characterPaths) {
      try {
        const character = JSON.parse(fs.readFileSync(path, "utf8"));

        validateCharacterConfig(character);

        loadedCharacters.push(character);
      } catch (e) {
        console.error(`Error loading character from ${path}: ${e}`);
        // don't continue to load if a specified file is not found
        process.exit(1);
      }
    }
  }

  if (loadedCharacters.length === 0) {
    console.log("No characters found, using default character");
    loadedCharacters.push(defaultCharacter);
  }

  return loadedCharacters;
}

export function getTokenForProvider(
  provider: ModelProviderName,
  character: Character
) {
  switch (provider) {
    case ModelProviderName.OPENAI:
      return (
        character.settings?.secrets?.OPENAI_API_KEY || settings.OPENAI_API_KEY
      );
    case ModelProviderName.LLAMACLOUD:
      return (
        character.settings?.secrets?.LLAMACLOUD_API_KEY ||
        settings.LLAMACLOUD_API_KEY ||
        character.settings?.secrets?.TOGETHER_API_KEY ||
        settings.TOGETHER_API_KEY ||
        character.settings?.secrets?.XAI_API_KEY ||
        settings.XAI_API_KEY ||
        character.settings?.secrets?.OPENAI_API_KEY ||
        settings.OPENAI_API_KEY
      );
    case ModelProviderName.ANTHROPIC:
      return (
        character.settings?.secrets?.ANTHROPIC_API_KEY ||
        character.settings?.secrets?.CLAUDE_API_KEY ||
        settings.ANTHROPIC_API_KEY ||
        settings.CLAUDE_API_KEY
      );
    case ModelProviderName.REDPILL:
      return (
        character.settings?.secrets?.REDPILL_API_KEY || settings.REDPILL_API_KEY
      );
    case ModelProviderName.OPENROUTER:
      return (
        character.settings?.secrets?.OPENROUTER || settings.OPENROUTER_API_KEY
      );
    case ModelProviderName.GROK:
      return character.settings?.secrets?.GROK_API_KEY || settings.GROK_API_KEY;
    case ModelProviderName.HEURIST:
      return (
        character.settings?.secrets?.HEURIST_API_KEY || settings.HEURIST_API_KEY
      );
    case ModelProviderName.GROQ:
      return character.settings?.secrets?.GROQ_API_KEY || settings.GROQ_API_KEY;
  }
}

function initializeDatabase(dataDir: string) {
  if (process.env.POSTGRES_URL) {
    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL,
    });
    return db;
  } else {
    const filePath =
      process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
    // ":memory:";
    const db = new SqliteDatabaseAdapter(new Database(filePath));
    return db;
  }
}

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  if (clientTypes.includes("auto")) {
    const autoClient = await AutoClientInterface.start(runtime);
    if (autoClient) clients.push(autoClient);
  }

  if (clientTypes.includes("discord")) {
    clients.push(await DiscordClientInterface.start(runtime));
  }

  if (clientTypes.includes("telegram")) {
    const telegramClient = await TelegramClientInterface.start(runtime);
    if (telegramClient) clients.push(telegramClient);
  }

  if (clientTypes.includes("twitter")) {
    const twitterClients = await TwitterClientInterface.start(runtime);
    clients.push(twitterClients);
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }

  return clients;
}

export function createAgent(
  character: Character,
  db: IDatabaseAdapter,
  cache: ICacheManager,
  token: string
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name
  );
  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider || ModelProviderName.GAIANET,
    evaluators: [],
    character,
    plugins: [
      bootstrapPlugin,
      solanaPlugin,
      character.settings.secrets?.WALLET_PUBLIC_KEY ? solanaPlugin : null,
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  });
}

function intializeFsCache(baseDir: string, character: Character) {
  const cacheDir = path.resolve(baseDir, character.id, "cache");

  const cache = new CacheManager(new FsCacheAdapter(cacheDir));
  return cache;
}

function intializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
  const cache = new CacheManager(new DbCacheAdapter(db, character.id));
  return cache;
}

async function startAgent(character: Character, directClient: DirectClient) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);

    await db.init();

    const cache = intializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    await runtime.initialize();

    const clients = await initializeClients(character, runtime);

    directClient.registerAgent(runtime);

    return clients;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error
    );
    console.error(error);
    throw error;
  }
}

async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const profilePath = path.join(__dirname, '../data/profiles', `${userId}.json`);
  try {
    const data = await fsPromises.readFile(profilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const profileDir = path.join(__dirname, '../data/profiles');
  await fsPromises.mkdir(profileDir, { recursive: true });
  const profilePath = path.join(profileDir, `${userId}.json`);
  await fsPromises.writeFile(profilePath, JSON.stringify(profile, null, 2));
}

async function askRiskProfilingQuestions(): Promise<UserProfile> {
  return new Promise((resolve) => {
    const questions = [
      'On a scale of 1-5, how comfortable are you with financial risk? (1=very conservative, 5=very aggressive): ',
      'What percentage of your investment are you willing to risk for higher returns? (0-100): ',
      'How would you react to a 20% drop in your investment value? (1=sell immediately, 5=buy more): '
    ];
    
    let answers: number[] = [];
    
    const askQuestion = (index: number) => {
      rl.question(questions[index], (answer) => {
        const numAnswer = parseInt(answer);
        if (isNaN(numAnswer)) {
          console.log('Please enter a valid number');
          askQuestion(index);
          return;
        }
        
        answers.push(numAnswer);
        if (index < questions.length - 1) {
          askQuestion(index + 1);
        } else {
          // Calculate risk tolerance based on answers
          const avgRisk = answers.reduce((a, b) => a + b, 0) / answers.length;
          const riskTolerance = avgRisk <= 2 ? 'low' : avgRisk <= 3.5 ? 'medium' : 'high';
          
          resolve({
            riskTolerance,
            firstTime: false
          });
        }
      });
    };
    
    askQuestion(0);
  });
}

const startAgents = async () => {
  const directClient = await DirectClientInterface.start();
  const args = parseArguments();

  let charactersArg = args.characters || args.character;

  let characters = [character];
  console.log("charactersArg", charactersArg);
  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }
  console.log("characters", characters);

  // Check for first-time user and do risk profiling
  const userId = "user"; // You might want to implement proper user identification
  let userProfile = await getUserProfile(userId);

  if (!userProfile) {
    console.log("\nWelcome! Let's set up your risk profile first.\n");
    userProfile = await askRiskProfilingQuestions();
    await saveUserProfile(userId, userProfile);
    console.log(`\nRisk profile saved! Your risk tolerance is: ${userProfile.riskTolerance}\n`);
  }

  try {
    for (const character of characters) {
      // Enhance character settings with detailed risk profile information
      character.settings = {
        ...character.settings,
        secrets: {
          ...character.settings?.secrets,
          userRiskProfile: JSON.stringify({
            riskTolerance: userProfile.riskTolerance,
            riskToleranceDetails: {
              level: userProfile.riskTolerance,
              description: getRiskToleranceDescription(userProfile.riskTolerance),
              maxDrawdown: getRiskToleranceDrawdown(userProfile.riskTolerance),
              recommendedInvestmentTypes: getRiskToleranceInvestments(userProfile.riskTolerance),
            },
            lastUpdated: new Date().toISOString(),
          }),
          investmentPreferences: JSON.stringify({
            maxRiskPerTrade: getMaxRiskPerTrade(userProfile.riskTolerance),
            preferredInvestmentHorizon: getInvestmentHorizon(userProfile.riskTolerance),
            stopLossPreference: getStopLossPreference(userProfile.riskTolerance),
          })
        }
      };
      await startAgent(character, directClient as DirectClient);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
  }

  function chat() {
    const agentId = characters[0].name ?? "Agent";
    rl.question("You: ", async (input) => {
      await handleUserInput(input, agentId);
      if (input.toLowerCase() !== "exit") {
        chat();
      }
    });
  }

  elizaLogger.log("Chat started. Type 'exit' to quit.");
  chat();
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1); // Exit the process after logging
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("SIGINT", () => {
  rl.close();
  process.exit(0);
});

async function handleUserInput(input, agentId) {
  if (input.toLowerCase() === "exit") {
    rl.close();
    process.exit(0);
    return;
  }

  try {
    const serverPort = parseInt(settings.SERVER_PORT || "3000");

    const response = await fetch(
      `http://localhost:${serverPort}/${agentId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User",
        }),
      }
    );

    const data = await response.json();
    data.forEach((message) => console.log(`${"Agent"}: ${message.text}`));
  } catch (error) {
    console.error("Error fetching response:", error);
  }
}

function getRiskToleranceDescription(riskTolerance: string): string {
  switch (riskTolerance) {
    case 'low':
      return 'Conservative investor preferring stability over high returns. Focus on capital preservation.';
    case 'medium':
      return 'Balanced investor accepting moderate risks for potential higher returns.';
    case 'high':
      return 'Aggressive investor comfortable with high risks for potentially higher returns.';
    default:
      return 'Risk tolerance level not specified.';
  }
}

function getRiskToleranceDrawdown(riskTolerance: string): number {
  switch (riskTolerance) {
    case 'low':
      return 10; // 10% maximum drawdown
    case 'medium':
      return 20; // 20% maximum drawdown
    case 'high':
      return 30; // 30% maximum drawdown
    default:
      return 15;
  }
}

function getRiskToleranceInvestments(riskTolerance: string): string[] {
  switch (riskTolerance) {
    case 'low':
      return ['Stable Coins', 'Blue Chip Tokens', 'Large Cap Assets'];
    case 'medium':
      return ['Mid Cap Tokens', 'Established DeFi Protocols', 'Yield Farming'];
    case 'high':
      return ['Small Cap Tokens', 'New DeFi Protocols', 'Leveraged Trading'];
    default:
      return ['Stable Coins', 'Blue Chip Tokens'];
  }
}

function getMaxRiskPerTrade(riskTolerance: string): number {
  switch (riskTolerance) {
    case 'low':
      return 2; // 2% per trade
    case 'medium':
      return 5; // 5% per trade
    case 'high':
      return 10; // 10% per trade
    default:
      return 3;
  }
}

function getInvestmentHorizon(riskTolerance: string): string {
  switch (riskTolerance) {
    case 'low':
      return 'long-term';
    case 'medium':
      return 'medium-term';
    case 'high':
      return 'short-term';
    default:
      return 'medium-term';
  }
}

function getStopLossPreference(riskTolerance: string): number {
  switch (riskTolerance) {
    case 'low':
      return 5; // 5% stop loss
    case 'medium':
      return 10; // 10% stop loss
    case 'high':
      return 15; // 15% stop loss
    default:
      return 7;
  }
}

const userRiskProfile = JSON.parse(character.settings?.secrets?.userRiskProfile || '{}');
const investmentPreferences = JSON.parse(character.settings?.secrets?.investmentPreferences || '{}');
