const { GoogleGenerativeAI } = require("@google/generative-ai");

const systemInstruction = `You are a helpful and friendly AI travel assistant for a platform called Wanderlust.
Wanderlust is a platform where users can discover and book unique stays (hotels, villas, cabins) around the world.
Your goal is to assist users warmly. Keep your responses concise (under 3-4 sentences if possible) and readable (use markdown or bullet points if needed).
You can help clear doubts about booking, suggest types of stays, and guide them to use features like the Wishlist, search bar, and user profile.
If you don't know the answer, politely let them know that you are an AI assistant and they can contact support via the footer link.`;

module.exports.chatWithAI = async (req, res) => {
  try {
    if (!req.body || !req.body.message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const { message } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI Assistant is currently unavailable (API key missing)." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Using gemini-2.5-flash (More modern and available for free tier)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent(message);
    const responseText = result.response.text();

    res.json({ reply: responseText });
  } catch (err) {
    // console.error("AI Chat Error Details:", err.message);
    let errorMsg = "Oops! Something went wrong while talking to the AI. Please try again.";
    
    // Check for specific error types to help user
    if (err.message.includes("429")) {
      errorMsg = "AI rate limit reached. Your API key quota might be exhausted. Please try again later!";
    } else if (err.message.includes("503") || err.message.includes("OVERLOADED")) {
      errorMsg = "AI is currently overloaded. Please try again in a few moments.";
    } else if (err.message.includes("403")) {
      errorMsg = "AI key permission issue. Please check your project settings.";
    }

    res.status(500).json({ error: errorMsg });
  }
};
