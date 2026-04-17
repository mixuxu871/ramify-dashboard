const parseDatabook = require('../../lib/parseExcel')

/**
 * Converts an OneDrive sharing URL to a direct download URL.
 * Supports:
 *   - https://1drv.ms/x/s!XXXX   (short personal URL)
 *   - https://onedrive.live.com/... (long URL)
 *   - https://.../s!XXXX          (any URL containing a share token)
 */
function getDownloadUrl(shareUrl) {
  // Extract the s! share token if present (most common for personal OneDrive)
  const tokenMatch = shareUrl.match(/(s![A-Za-z0-9!_-]+)/)
  if (tokenMatch) {
    const token = tokenMatch[1]
    console.log('Using share token:', token)
    return `https://api.onedrive.com/v1.0/shares/${token}/root/content`
  }

  // Fallback: base64url encode the full URL
  const encoded = Buffer.from(shareUrl)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  console.log('Using base64url encoded URL')
  return `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`
}

export default async function handler(req, res) {
  const shareUrl = process.env.ONEDRIVE_SHARE_URL
  if (!shareUrl) {
    return res.status(500).json({ error: 'ONEDRIVE_SHARE_URL non configure dans les variables d\'environnement Vercel' })
  }

  try {
    const downloadUrl = getDownloadUrl(shareUrl)
    console.log('Fetching:', downloadUrl)

    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'RamifyDashboard/1.0',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(30000),
    })

    console.log('Response status:', response.status, response.statusText)
    console.log('Content-type:', response.headers.get('content-type'))

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('Error body:', body.slice(0, 500))
      throw new Error(`OneDrive fetch failed: ${response.status} ${response.statusText}. Body: ${body.slice(0, 300)}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      const body = await response.text()
      console.error('Got HTML/JSON instead of file:', body.slice(0, 300))
      throw new Error(`OneDrive a renvoye du HTML au lieu du fichier. Verifiez les permissions du lien de partage.`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log('File size:', buffer.length, 'bytes')

    if (buffer.length < 1000) {
      throw new Error(`Fichier trop petit (${buffer.length} octets) - telechargement echoue`)
    }

    const data = parseDatabook(buffer)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Dashboard data error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
