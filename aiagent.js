

import readline from "readline";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config(); // Load API key from .env file

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Function to send user query to Gemini API
async function askGemini(question) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }],
      }),
    });

    const data = await response.json();
    
    // Extract response text safely
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    
    return reply;
  } catch (error) {
    console.error("Error fetching response:", error);
    return "Sorry, I couldn't process your request.";
  }
}

// Setup command-line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🤖 AI Chatbot (Type 'exit' to quit)");
function chat() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      console.log("Goodbye! 👋");
      rl.close();
      return;
    }
    const response = await askGemini(input);
    console.log("AI:", response);
    chat(); // Continue conversation
  });
}

chat();





const SYSTEM_PROMPT = "You are an AI Assistant with START, PLAN, ACTION, Obeservation and Output State. Wait for the user prompt and first PLAN using available tools. After Planning, Take the action with appropriate tools and wait for Observation based on Action. Once you get the observations, Return the AI response based on START prompt and observations. Strictly follow the JSON output format as in examples. Available Tools: - function getWeatherDetails(city: string): string getWeatherDetails is a function that accepts city name as string and returns the weather details. Example: START { \"type\": \"user\", \"user\": \"What is the sum of weather of Patiala and Mohali?\" } { \"type\": \"plan\", \"plan\": \"I will call the getWeatherDetails for Patiala\" } { \"type\": \"action\", \"function\": \"getWeatherDetails\", \"input\": \"patiala\" } { \"type\": \"observation\", \"observation\": \"10°C\" } { \"type\": \"plan\", \"plan\": \"I will call getWeatherDetails for Mohali\" } { \"type\": \"action\", \"function\": \"getWeatherDetails\", \"input\": \"mohali\" } { \"type\": \"observation\", \"observation\": \"14°C\" } { \"type\": \"output\", \"output\": \"The sum of weather of Patiala and Mohali is 24°C\" }";





// curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=GEMINI_API_KEY" \
// -H 'Content-Type: application/json' \
// -X POST \
// -d '{
//   "contents": [{
//     "parts":[{"text": "Explain how AI works"}]
//     }]
//    }'


while (true) { 
    const chat = await client.chat.completions.create({ 
        model: 'gpt-4', 
        messages: messages, 
        response_format: { type: 'json_object' }, 
    }); 

    const result = chat.choices[0].message.content; 
    messages.push({ role: 'assistant', content: result }); 

    const call = JSON.parse(result); 

    if (call.type === 'output') { 
        console.log(`Output: ${call.output}`); 
        break; 
    } 
    else if (call.type === 'action') { 
        const fn = tools[call.function]; 
        const observation = fn(call.input); 
        
        const obs = { type: 'observation', observation: observation }; 
        messages.push({ role: 'developer', content: JSON.stringify(obs) }); 
    }
}
