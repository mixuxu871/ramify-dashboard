const parseDatabook = require('../../lib/parseExcel')

/**
 * Converts a sharing URL to a direct download URL.
 * Handles both SharePoint/OneDrive for Business and personal OneDrive.
 */
function getDownloadUrl(shareUrl) {
  // SharePoint / OneDrive for Business (ramify-my.sharepoint.com, etc.)
  if (shareUrl.includes('sharepoint.com')) {
    const encoded = Buffer.from(shareUrl)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    console.log('SharePoint URL detected, using Graph API')
    return `https://graph.microsoft.com/v1.0/shares/u!${encoded}/driveItem/content`
  }

  // Personal OneDrive — try extracting s! token
  const tokenMatch = shareUrl.match(/(s![A-Za-z0-9!_-]+)/)
  if (tokenMatch) {
    console.log('Personal OneDrive s! token detected')
    return `https://api.onedrive.com/v1.0/shares/${tokenMatch[1]}/root/content`
  }

  // Fallback: base64url encode full URL
  const encoded = Buffer.from(shareUrl)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  console.log('Fallback: base64url encoding')
  return `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`
}

export default async function handler(req, res) {
  const shareUrl = process.env.ONEDRIVE_SHARE_URL
  if (!shareUrl) {
    return res.status(500).json({
      error: "ONEDRIVE_SHARE_URL non configure dans les variables d'environnement Vercel"
    })
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

      // SharePoint often returns 401 if external sharing is disabled
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Acces refuse (${response.status}). Verifiez que le lien SharePoint est partage en mode "Toute personne avec le lien" (pas uniquement les membres de Ramify).`
        )
      }

      throw new Error(
        `Telechargement echoue: ${response.status} ${response.statusText}. Body: ${body.slice(0, 200)}`
      )
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html')) {
      const body = await response.text()
      console.error('Got HTML instead of file:', body.slice(0, 300))
      throw new Error(
        'SharePoint a renvoye une page HTML au lieu du fichier. Le lien de partage ne permet pas le telechargement anonyme.'
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log('File size:', buffer.length, 'bytes')

    if (buffer.length < 1000) {
      throw new Error(`Fichier trop petit (${buffer.length} octets) — telechargement echoue`)
    }

    const data = parseDatabook(buffer)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Dashboard data error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
