export async function GeminiChat(messages) {
  const prompt = messages.map(m =>
    `${m.sender === 'user' ? 'User' : 'Clara'}: ${m.text}`
  ).join('\n') + '\nClara:';

  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": process.env.NEXT_PUBLIC_GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    const data = await res.json();
    if (data.error) {
      console.error("Gemini error:", data.error);
      return `I'm Clara. Gemini error: ${data.error.message || 'unknown error'}`;
    }
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return reply || "I'm Clara. I’m here to help. Could you please clarify?";
  } catch (error) {
    console.error("Gemini API error:", error);
    return "I'm Clara. Something went wrong while processing your request.";
  }
}
