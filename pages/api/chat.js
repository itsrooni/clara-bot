import { GeminiChat } from '../../utils/gemini';

export default async function handler(req, res) {
  try {
    const { messages } = req.body;
    const reply = await GeminiChat(messages);
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ reply: 'Sorry, Gemini failed to respond.' });
  }
}


// import OpenAI from 'openai';
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// export default async function handler(req, res) {
//   const { messages } = req.body;
//   const response = await openai.chat.completions.create({
//     model: 'gpt-3.5-turbo',
//     messages: [
//       { role: 'system', content: 'You are Clara, a friendly assistant at Nestzone.' },
//       ...messages.map(m => ({
//         role: m.sender === 'user' ? 'user' : 'assistant',
//         content: m.text
//       }))
//     ]
//   });
//   const reply = response.choices[0].message.content.trim();
//   res.status(200).json({ reply });
// }
