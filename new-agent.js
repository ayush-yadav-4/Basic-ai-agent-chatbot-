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
    // For debugging purposes
    const debug = false;
    if (debug) {
      console.log("Raw AI response:", response);
    }
    
    // If the response looks like it might contain JSON
    if (response.includes('"type"') && (response.includes('"action"') || response.includes('"output"'))) {
      // Extract all possible JSON objects from the response
      const jsonObjects = [];
      const jsonPattern = /{[\s\S]*?}/g;
      let match;
      
      while ((match = jsonPattern.exec(response)) !== null) {
        try {
          const jsonStr = match[0];
          const json = JSON.parse(jsonStr);
          jsonObjects.push(json);
        } catch (e) {
          // Not valid JSON, skip
        }
      }
      
      if (debug) {
        console.log("Extracted JSON objects:", jsonObjects.length);
      }
      
      // Process the JSON objects
      const observations = {};
      let finalOutput = '';
      
      for (const json of jsonObjects) {
        if (json.type === 'action') {
          if (debug) {
            console.log(`Executing tool: ${json.function} with input: ${json.input}`);
          }
          const result = await executeTool(json);
          observations[json.function] = {
            input: json.input,
            result: result
          };
        } else if (json.type === 'output') {
          finalOutput = json.output;
        }
      }
      
      // If no explicit output but we have observations, create a response
      if (!finalOutput && Object.keys(observations).length > 0) {
        finalOutput = "Here's what I found:\n\n";
        for (const data of Object.values(observations)) {
          finalOutput += `${data.result}\n\n`;
        }
      }
      
      if (finalOutput) {
        return finalOutput;
      }
    }
    
    // Direct keyword matching as fallback
    const keywords = {
      'best time to visit': {
        tool: 'getBestTimeToVisit',
        regex: /best time to visit\s+(\w+)/i
      },
      'weather in': {
        tool: 'getWeatherDetails',
        regex: /weather(?:\s+in)?\s+(\w+)/i
      },
      'forecast': {
        tool: 'getWeatherForecast',
        regex: /(?:weather\s+)?forecast(?:\s+for)?\s+(\w+)/i
      },
      'places to visit': {
        tool: 'getFamousPlaces',
        regex: /(?:places|attractions|sights)(?:\s+to\s+visit)?\s+(?:in\s+)?(\w+)/i
      },
      'food in': {
        tool: 'getFamousFood',
        regex: /(?:food|cuisine|dishes)(?:\s+in)?\s+(\w+)/i
      },
      'destinations': {
        tool: 'getFamousDestinations',
        regex: /(?:destinations|tourist\s+spots)(?:\s+in)?\s+(\w+)/i
      }
    };
    
    // Try to match the user's query directly
    const userMessage = response.toLowerCase();
    
    for (const [key, info] of Object.entries(keywords)) {
      if (userMessage.includes(key)) {
        const match = userMessage.match(info.regex);
        if (match && match[1]) {
          const city = match[1];
          if (debug) {
            console.log(`Matched keyword '${key}' for city '${city}'`);
          }
          const result = await executeTool({
            function: info.tool,
            input: city
          });
          return result;
        }
      }
    }
    
    // Emergency direct parsing for common queries
    if (userMessage.includes("best time") && userMessage.includes("mumbai")) {
      return await getBestTimeToVisit("mumbai");
    } else if (userMessage.includes("best time") && userMessage.includes("delhi")) {
      return await getBestTimeToVisit("delhi");
    } else if (userMessage.includes("best time") && userMessage.includes("bangalore")) {
      return await getBestTimeToVisit("bangalore");
    }
    
    // Direct query parsing
    const cityMatch = /(?:about|in|for|visit)\s+(\w+)/i.exec(userMessage);
    if (cityMatch && cityMatch[1]) {
      const city = cityMatch[1].toLowerCase();
      if (userMessage.includes("weather")) {
        return await getWeatherDetails(city);
      } else if (userMessage.includes("food")) {
        const foods = await getFamousFood(city);
        return `Famous foods in ${city.charAt(0).toUpperCase() + city.slice(1)}: ${foods.join(', ')}`;
      } else if (userMessage.includes("place")) {
        const places = await getFamousPlaces(city);
        return `Famous places in ${city.charAt(0).toUpperCase() + city.slice(1)}: ${places.join(', ')}`;
      } else {
        // Default to best time to visit
        return await getBestTimeToVisit(city);
      }
    }
    
    return "I'm sorry, I couldn't understand your request. You can ask about weather, food, places to visit, or the best time to visit cities like Mumbai, Delhi, or Bangalore.";
  } catch (error) {
    console.error('Error processing AI response:', error);
    return "I'm having trouble processing that request right now.";
  }
}

// Modified system prompt with clearer instructions
const SYSTEM_PROMPT = `You are an AI Assistant with structured reasoning. For each request:
1. Analyze what the user is asking about
2. Choose the appropriate tool to call
3. Return your response in valid JSON format

Available Tools:
1. function getWeatherDetails(city: string): string → Returns current weather details.
2. function getFamousFood(city: string): string → Returns famous food.
3. function getFamousPlaces(city: string): string → Returns famous places.
4. function getWeatherForecast(city: string): string → Returns 5-day weather forecast.
5. function getFamousDestinations(city: string): string → Returns top tourist destinations.
6. function getBestTimeToVisit(city: string): string → Returns the best season to visit.

IMPORTANT: Always respond with valid JSON. Here's an example:
For the query "What's the weather forecast for Delhi and when is the best time to visit?":
{ "type": "action", "function": "getWeatherForecast", "input": "Delhi" }
{ "type": "action", "function": "getBestTimeToVisit", "input": "Delhi" }
{ "type": "output", "output": "The weather in Delhi is sunny with temperatures between 25°C to 32°C. The best time to visit Delhi is from October to March when the weather is pleasant and perfect for sightseeing." }`;

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

    console.log("🤖 Processing your request...");
    const aiResponse = await askGemini([input]);
    const processedResponse = await processAIResponse(input); // Use input instead of aiResponse as fallback
    console.log("🤖 AI:", processedResponse);

    chat();
  });
}

chat();