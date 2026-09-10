// Public tool endpoint. Origin checks are browser protection, not authentication.
// Configure a Vercel WAF rate limit for this path before production rollout.
export const config = { api: { bodyParser: { sizeLimit: '20kb' } } };
const ORIGINS = new Set(['https://thesoloentrepreneur.in', 'https://www.thesoloentrepreneur.in']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let origin;
  try {
    const supplied = req.headers.origin || req.headers.referer;
    const url = new URL(supplied);
    if (url.username || url.password) throw new Error('Invalid origin');
    origin = url.origin;
    const local = process.env.NODE_ENV === 'development' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!ORIGINS.has(origin) && !local) throw new Error('Invalid origin');
  } catch {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const { messages, temperature = 0.85 } = req.body;
  if (!Array.isArray(messages) || !messages.length || messages.length > 8 ||
      !messages.every(m => m && ['system', 'user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 8000) ||
      messages.reduce((sum, m) => sum + m.content.length, 0) > 12000 ||
      typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return res.status(400).json({ error: 'Invalid or oversized generation request' });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Generation is temporarily unavailable' });
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages.map(({ role, content }) => ({ role, content })),
        temperature,
        max_tokens: 1500,
      }),
    });
    if (!response.ok) return res.status(502).json({ error: 'Generation failed. Please try again.' });
    const data = await response.json();
    return res.status(200).json({ choices: data.choices });
  } catch {
    return res.status(502).json({ error: 'Generation failed. Please try again.' });
  }
}
