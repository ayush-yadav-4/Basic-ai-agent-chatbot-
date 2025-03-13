

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
