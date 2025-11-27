import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";
import "dotenv/config";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const conversationHistory: Array<{
  role: "user" | "assistant";
  content: string;
}> = [];

async function chat(userMessage: string): Promise<string> {
  conversationHistory.push({
    role: "user",
    content: userMessage,
  });

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: conversationHistory,
  });

  const assistantMessage =
    response.content[0].type === "text" ? response.content[0].text : "";

  conversationHistory.push({
    role: "assistant",
    content: assistantMessage,
  });

  return assistantMessage;
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  console.log("\n🤖 Claude Chat CLI");
  console.log("=".repeat(50));
  console.log("Type 'exit' to quit, 'clear' to clear history\n");

  while (true) {
    const userInput = await prompt("You: ");

    if (userInput.toLowerCase() === "exit") {
      console.log("\nGoodbye! 👋");
      rl.close();
      break;
    }

    if (userInput.toLowerCase() === "clear") {
      conversationHistory.length = 0;
      console.log("✨ Conversation history cleared.\n");
      continue;
    }

    if (!userInput.trim()) {
      continue;
    }

    try {
      console.log("\nClaude: Thinking...");
      const response = await chat(userInput);
      console.log(`\nClaude: ${response}\n`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\n❌ Error: ${error.message}\n`);
      } else {
        console.error("\n❌ An unknown error occurred\n");
      }
    }
  }
}

main();
