import readline from "readline";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Mock functions to simulate API calls for city information
async function getWeatherForecast(city) {
  // In a real application, this would call a weather API
  const forecasts = {
    'delhi': 'Next 5 days: Sunny with temperatures ranging from 25°C to 32°C',
    'mumbai': 'Next 5 days: Partly cloudy with chances of rain, temperatures 24°C to 30°C',
    'bangalore': 'Next 5 days: Pleasant weather with temperatures 20°C to 28°C',
    'default': 'Weather forecast not available for this city'
  };
  return forecasts[city.toLowerCase()] || forecasts.default;
}

async function getFamousDestinations(city) {
  // In a real application, this would call a tourism API
  const destinations = {
    'delhi': ['Red Fort', 'Qutub Minar', 'India Gate', 'Humayun\'s Tomb'],
    'mumbai': ['Gateway of India', 'Marine Drive', 'Elephanta Caves'],
    'bangalore': ['Lalbagh Botanical Garden', 'Bangalore Palace', 'Cubbon Park'],
    'default': ['No specific destinations found for this city']
  };
  return destinations[city.toLowerCase()] || destinations.default;
}

async function getBestTimeToVisit(city) {
  // In a real application, this would call a tourism API
  const bestTimes = {
    'delhi': 'October to March is the best time to visit Delhi when the weather is pleasant and perfect for sightseeing',
    'mumbai': 'November to February offers the most comfortable climate for exploring Mumbai',
    'bangalore': 'September to February is ideal for visiting Bangalore due to moderate temperatures',
    'default': 'Best time information not available for this city'
  };
  return bestTimes[city.toLowerCase()] || bestTimes.default;
}

async function getWeatherDetails(city) {
  // In a real application, this would call a weather API
  const weather = {
    'delhi': 'Currently 28°C with clear skies',
    'mumbai': 'Currently 26°C with high humidity',
    'bangalore': 'Currently 22°C with light breeze',
    'default': 'Current weather information not available for this city'
  };
  return weather[city.toLowerCase()] || weather.default;
}

async function getFamousFood(city) {
  // In a real application, this would call a food/culture API
  const food = {
    'delhi': ['Butter Chicken', 'Chole Bhature', 'Parantha', 'Chaat'],
    'mumbai': ['Vada Pav', 'Pav Bhaji', 'Bhel Puri', 'Mumbai Sandwich'],
    'bangalore': ['Masala Dosa', 'Bisi Bele Bath', 'Ragi Mudde', 'Filter Coffee'],
    'default': ['No specific food information found for this city']
  };
  return food[city.toLowerCase()] || food.default;
}

async function getFamousPlaces(city) {
  // In a real application, this would call a tourism API
  const places = {
    'delhi': ['Red Fort', 'India Gate', 'Lotus Temple', 'Akshardham Temple'],
    'mumbai': ['Gateway of India', 'Marine Drive', 'Juhu Beach', 'Colaba'],
    'bangalore': ['Lalbagh', 'MG Road', 'Wonderla', 'Bannerghatta National Park'],
    'default': ['No famous places information found for this city']
  };
  return places[city.toLowerCase()] || places.default;
}

// Function to execute tool based on AI response
async function executeTool(action) {
  try {
    const availableTools = {
      getWeatherDetails,
      getFamousFood,
      getFamousPlaces,
      getWeatherForecast,
      getFamousDestinations,
      getBestTimeToVisit
    };

    const tool = availableTools[action.function];
    if (!tool) {
      throw new Error(`Unknown tool: ${action.function}`);
    }

    return await tool(action.input);
  } catch (error) {
    console.error(`Error executing tool ${action.function}:`, error.message);
    return `Error executing ${action.function}`;
  }
}

// Function to process AI response and execute tools
async function processAIResponse(response) {
  try {
    const lines = response.split('\n');
    let output = '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);
        
        if (json.type === 'action') {
          const result = await executeTool(json);
          console.log(`🛠️ Tool ${json.function} result:`, result);
        } else if (json.type === 'output') {
          output = json.output;
        }
      } catch (e) {
        // Skip lines that aren't valid JSON
        continue;
      }
    }

    return output || response;
  } catch (error) {
    console.error('Error processing AI response:', error.message);
    return response;
  }
}

// System prompt to guide AI behavior
const SYSTEM_PROMPT = `You are an AI Assistant with structured reasoning: START → PLAN → ACTION → OBSERVATION → OUTPUT.
Strictly follow the JSON format for output.

Available Tools:
1. function getWeatherDetails(city: string): string → Returns current weather details.
2. function getFamousFood(city: string): string → Returns famous food.
3. function getFamousPlaces(city: string): string → Returns famous places.
4. function getWeatherForecast(city: string): string → Returns 5-day weather forecast.
5. function getFamousDestinations(city: string): string → Returns top tourist destinations.
6. function getBestTimeToVisit(city: string): string → Returns the best season to visit.

Example:
START { "type": "user", "user": "What's the weather forecast for Delhi and when is the best time to visit?" }
{ "type": "plan", "plan": "I will check the weather forecast and best time to visit Delhi." }
{ "type": "action", "function": "getWeatherForecast", "input": "Delhi" }
{ "type": "observation", "observation": "Next 5 days: Sunny with temperatures ranging from 25°C to 32°C" }
{ "type": "action", "function": "getBestTimeToVisit", "input": "Delhi" }
{ "type": "observation", "observation": "October to March is the best time to visit Delhi when the weather is pleasant and perfect for sightseeing" }
{ "type": "output", "output": "The weather forecast for Delhi shows sunny conditions with temperatures between 25°C to 32°C for the next 5 days. The best time to visit Delhi is from October to March when the weather is pleasant and perfect for sightseeing." }`;

// Function to call Gemini API
async function askGemini(userMessages) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Missing Gemini API Key! Please check your .env file.");
    }

    const messages = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] }, // Include system prompt
      ...userMessages.map(msg => ({ role: "user", parts: [{ text: msg }] })),
    ];

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: messages }),
    });

    const data = await response.json();

    if (!data || !data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid API response format");
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("❌ Error fetching response:", error.message);
    return "Error: Failed to process request.";
  }
}

// CLI Setup
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🤖 AI Travel & Info Assistant (Type 'exit' to quit)");

async function chat() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye! 👋");
      rl.close();
      return;
    }

    const aiResponse = await askGemini([input]);
    const processedResponse = await processAIResponse(aiResponse);
    console.log("🤖 AI:", processedResponse);

    chat();
  });
}

chat();
