/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Chat } from '@google/genai';

const API_KEY = process.env.API_KEY;

// DOM Element References
const gameOutput = document.getElementById('game-output') as HTMLDivElement;
const promptForm = document.getElementById('prompt-form') as HTMLFormElement;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const formButton = promptForm.querySelector('button') as HTMLButtonElement;
const healthValueEl = document.getElementById('health-value') as HTMLSpanElement;
const inventoryListEl = document.getElementById('inventory-list') as HTMLSpanElement;

// Game State
let playerHealth = 100;
let playerInventory: string[] = [];

/**
 * Updates the player status UI with the current health and inventory.
 */
function updateStatusUI() {
  healthValueEl.textContent = playerHealth.toString();
  if (playerInventory.length === 0) {
    inventoryListEl.textContent = 'Empty';
  } else {
    inventoryListEl.textContent = playerInventory.join(', ');
  }
}


/**
 * Appends a new message to the game output.
 * @param content The text content of the message.
 * @param sender The sender of the message ('user' or 'gemini').
 * @returns The HTML element for the new message.
 */
function appendMessage(content: string, sender: 'user' | 'gemini'): HTMLElement {
  const messageElement = document.createElement('p');
  messageElement.classList.add('message', `${sender}-message`);
  messageElement.textContent = content;
  gameOutput.appendChild(messageElement);
  gameOutput.scrollTop = gameOutput.scrollHeight;
  return messageElement;
}

/**
 * Creates a streaming message element for Gemini's response.
 * @returns The HTML element for the streaming message.
 */
function createStreamingMessage(): HTMLElement {
    const messageElement = document.createElement('p');
    messageElement.classList.add('message', 'gemini-message');
    // Add an empty text node for the content that will be streamed into
    messageElement.appendChild(document.createTextNode(''));
    const cursor = document.createElement('span');
    cursor.classList.add('cursor');
    messageElement.appendChild(cursor);
    gameOutput.appendChild(messageElement);
    gameOutput.scrollTop = gameOutput.scrollHeight;
    return messageElement;
}

/**
 * Parses the AI's response to update game state (health, inventory).
 * @param responseText The full text response from the AI.
 * @returns The narrative part of the text, with status tags removed.
 */
function parseAndUpdateState(responseText: string): string {
    const statusRegex = /\[STATUS\]HEALTH:(\d+),INVENTORY:(.*?)\[\/STATUS\]/s;
    const match = responseText.match(statusRegex);

    if (match) {
        const newHealth = parseInt(match[1], 10);
        playerHealth = isNaN(newHealth) ? playerHealth : newHealth;

        const inventoryItems = match[2] ? match[2].split(',').map(item => item.trim()).filter(Boolean) : [];
        playerInventory = inventoryItems;
        
        updateStatusUI();
    }
    
    return responseText.replace(statusRegex, '').trim();
}

/**
 * Sets the disabled state of the input form.
 * @param isDisabled Whether the form should be disabled.
 */
function setFormDisabled(isDisabled: boolean) {
  promptInput.disabled = isDisabled;
  formButton.disabled = isDisabled;
  promptForm.classList.toggle('disabled', isDisabled);
  if (!isDisabled) {
    promptInput.focus();
  }
}

async function main() {
  if (!API_KEY) {
    appendMessage('Error: API_KEY environment variable not set.', 'gemini');
    return;
  }
  
  updateStatusUI(); // Initialize UI with starting state

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    const chat: Chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `You are an expert Dungeon Master running a classic text-based adventure game.
        Your world is a dark fantasy setting. You must manage the player's state, including health and inventory. The player starts with 100 health and an empty inventory.

        RULES:
        1. Start by describing the player's initial location and situation.
        2. Await the player's command and respond with vivid descriptions of the outcomes.
        3. If the player faces danger (monsters, traps), reduce their health and describe the damage.
        4. When the player finds and takes an item, add it to their inventory.
        5. Respond to commands like "check health" or "inventory" with the current status.
        6. Keep your responses concise but evocative.
        7. Never break character.
        8. At the very end of your response, you MUST provide a status update on a new line in the exact format: [STATUS]HEALTH:current_health,INVENTORY:item1,item2,item3[/STATUS].
        9. The inventory must be a comma-separated list of items. If the inventory is empty, write nothing after the "INVENTORY:" tag. For example: [STATUS]HEALTH:100,INVENTORY:[/STATUS].
        10. If health is unchanged, report the current health. Always include the full status line.`,
      },
    });

    // Handle form submission
    promptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userPrompt = promptInput.value.trim();
      if (!userPrompt) return;

      setFormDisabled(true);
      appendMessage(`> ${userPrompt}`, 'user');
      promptInput.value = '';
      
      const stream = await chat.sendMessageStream({ message: userPrompt });
      const streamingMessageEl = createStreamingMessage();
      
      let responseText = '';
      for await (const chunk of stream) {
        responseText += chunk.text;
        // Update the text content, keeping the cursor at the end.
        streamingMessageEl.childNodes[0].nodeValue = responseText.replace(/\[STATUS\].*\[\/STATUS\]/s, '').trim();
      }
      
      // Final parse and state update after stream is complete
      const finalNarrative = parseAndUpdateState(responseText);
      streamingMessageEl.childNodes[0].nodeValue = finalNarrative;
      streamingMessageEl.querySelector('.cursor')?.remove();

      setFormDisabled(false);
    });

    // Start the game with an initial message from the AI
    async function startGame() {
        setFormDisabled(true);
        const stream = await chat.sendMessageStream({ message: "Start the game." });
        const streamingMessageEl = createStreamingMessage();
        
        let responseText = '';
        for await (const chunk of stream) {
            responseText += chunk.text;
            streamingMessageEl.childNodes[0].nodeValue = responseText.replace(/\[STATUS\].*\[\/STATUS\]/s, '').trim();
        }
        
        const finalNarrative = parseAndUpdateState(responseText);
        streamingMessageEl.childNodes[0].nodeValue = finalNarrative;
        streamingMessageEl.querySelector('.cursor')?.remove();
        setFormDisabled(false);
    }
    
    startGame();

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    appendMessage(`Initialization Failed: ${errorMessage}`, 'gemini');
    setFormDisabled(true);
  }
}

main();