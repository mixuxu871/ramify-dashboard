const parseDatabook = require('../../lib/parseExcel')

export default async function handler(req, res) {
  const shareUrl = process.env.ONEDRIVE_SHARE_URL
  if (!shareUrl) {
    return res.status(500).json({ error: 'ONEDRIVE_SHARE_URL non configure dans les variables d\'environnement Vercel' })
  }

  try {
    // Convert OneDrive share URL to direct download URL
    // https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/shares_get
    const encoded = Buffer.from(shareUrl)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    const downloadUrl = `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`

    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'RamifyDashboard/1.0' },
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    if (!response.ok) {
      throw new Error(`OneDrive fetch failed: ${response.status} ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const data = parseDatabook(buffer)

    // Cache 5 minutes on CDN, serve stale while revalidating for 10 more
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Dashboard data error:', err)
    return res.status(500).json({ error: err.message })
  }
}
