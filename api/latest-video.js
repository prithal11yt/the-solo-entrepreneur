// Vercel Serverless Function — latest uploads for the homepage YouTube card.
// No API key: reads the channel's public RSS feed server-side (browsers can't, no CORS).
const CHANNEL_ID = 'UCV_DLB3VW0szIGQnwel1Nsw';

export default async function handler(req, res) {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheSoloEntrepreneur/1.0)' },
    });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const xml = await r.text();
    const videos = [...xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<published>([^<]+)<\/published>/g)]
      .slice(0, 15)
      .map(m => ({ id: m[1], title: m[2], published: m[3] }));
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ videos });
  } catch (e) {
    return res.status(502).json({ error: 'Could not load feed' });
  }
}
