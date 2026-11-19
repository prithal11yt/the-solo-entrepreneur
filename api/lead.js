// Saves an email left in exchange for a free download, then the page starts
// the download. Origin checks are browser protection, not authentication.
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };
const ORIGINS = new Set(['https://thesoloentrepreneur.in', 'https://www.thesoloentrepreneur.in']);
// Each free download the form can be used for. Unknown sources are refused.
const SOURCES = new Set(['scroll-site-generator', 'motion-director', 'ai-reel-engine', 'ai-for-kids-plan']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const url = new URL(req.headers.origin || req.headers.referer);
    const local = process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || (!ORIGINS.has(url.origin) && !local)) throw new Error('origin');
  } catch {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const { email, name, source, website } = req.body;
  // Honeypot: a field people never see. Bots fill it; pretend it worked.
  if (website) return res.json({ ok: true });
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      (name != null && (typeof name !== 'string' || name.length > 120)) ||
      typeof source !== 'string' || !SOURCES.has(source)) {
    return res.status(400).json({ error: 'Please enter a valid email.' });
  }
  const supabaseUrl = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: 'Temporarily unavailable' });
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/tse_leads?on_conflict=email,source`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), name: (name || '').trim() || null, source }),
    });
    if (!r.ok) throw new Error('insert failed');
    return res.json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Could not save right now' });
  }
}
