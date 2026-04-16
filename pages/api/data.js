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

    const apiUrl = `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`

    console.log('Fetching OneDrive URL:', shareUrl.slice(0, 40) + '...')
    console.log('API URL:', apiUrl)

    const response = await fetch(apiUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'RamifyDashboard/1.0',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    console.log('Response status:', response.status, response.statusText)
    console.log('Response content-type:', response.headers.get('content-type'))

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('OneDrive error body:', body.slice(0, 500))
      throw new Error(`OneDrive fetch failed: ${response.status} ${response.statusText}. Body: ${body.slice(0, 200)}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      const body = await response.text()
      console.error('Got HTML/JSON instead of file:', body.slice(0, 500))
      throw new Error(`OneDrive a renvoyé du HTML/JSON au lieu du fichier (${contentType}). Verifiez que le lien est un lien de telechargement direct.`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log('Downloaded file size:', buffer.length, 'bytes')

    if (buffer.length < 1000) {
      throw new Error(`Fichier trop petit (${buffer.length} octets) - telechargement probablement echoue`)
    }

    const data = parseDatabook(buffer)

    // Cache 5 minutes on CDN, serve stale while revalidating for 10 more
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Dashboard data error:', err)
    return res.status(500).json({ error: err.message })
  }
}
