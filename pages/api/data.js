const parseDatabook = require('../../lib/parseExcel')

export default async function handler(req, res) {
  const shareUrl = process.env.ONEDRIVE_SHARE_URL
  if (!shareUrl) {
    return res.status(500).json({
      error: "ONEDRIVE_SHARE_URL non configure dans les variables d'environnement Vercel"
    })
  }

  try {
    let buffer = null
    let lastError = null

    // ── Strategy 1: SharePoint direct download (append &download=1) ──────────
    if (shareUrl.includes('sharepoint.com')) {
      try {
        const sep = shareUrl.includes('?') ? '&' : '?'
        const directUrl = `${shareUrl}${sep}download=1`
        console.log('Strategy 1: SharePoint direct download', directUrl.slice(0, 80))

        const r = await fetch(directUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
          signal: AbortSignal.timeout(30000),
        })

        const ct = r.headers.get('content-type') || ''
        console.log('S1 status:', r.status, '| content-type:', ct)

        if (r.ok && !ct.includes('text/html') && !ct.includes('application/json')) {
          const ab = await r.arrayBuffer()
          buffer = Buffer.from(ab)
          console.log('S1 success, size:', buffer.length)
        } else {
          const body = await r.text()
          lastError = `S1 failed: ${r.status} ${ct} — ${body.slice(0, 100)}`
          console.log(lastError)
        }
      } catch (e) {
        lastError = `S1 exception: ${e.message}`
        console.log(lastError)
      }
    }

    // ── Strategy 2: Microsoft Graph API shares endpoint ───────────────────────
    if (!buffer) {
      try {
        const encoded = Buffer.from(shareUrl)
          .toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        const graphUrl = `https://graph.microsoft.com/v1.0/shares/u!${encoded}/driveItem/content`
        console.log('Strategy 2: Graph API', graphUrl.slice(0, 80))

        const r = await fetch(graphUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'RamifyDashboard/1.0', 'Accept': '*/*' },
          signal: AbortSignal.timeout(30000),
        })

        const ct = r.headers.get('content-type') || ''
        console.log('S2 status:', r.status, '| content-type:', ct)

        if (r.ok && !ct.includes('text/html')) {
          const ab = await r.arrayBuffer()
          buffer = Buffer.from(ab)
          console.log('S2 success, size:', buffer.length)
        } else {
          const body = await r.text()
          lastError = `S2 failed: ${r.status} ${ct} — ${body.slice(0, 100)}`
          console.log(lastError)
        }
      } catch (e) {
        lastError = `S2 exception: ${e.message}`
        console.log(lastError)
      }
    }

    // ── Strategy 3: OneDrive personal API (fallback) ──────────────────────────
    if (!buffer) {
      try {
        const tokenMatch = shareUrl.match(/(s![A-Za-z0-9!_-]+)/)
        const key = tokenMatch
          ? tokenMatch[1]
          : 'u!' + Buffer.from(shareUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        const odUrl = `https://api.onedrive.com/v1.0/shares/${key}/root/content`
        console.log('Strategy 3: OneDrive API')

        const r = await fetch(odUrl, {
          redirect: 'follow',
          headers: { 'User-Agent': 'RamifyDashboard/1.0' },
          signal: AbortSignal.timeout(30000),
        })

        const ct = r.headers.get('content-type') || ''
        console.log('S3 status:', r.status, '| content-type:', ct)

        if (r.ok && !ct.includes('text/html')) {
          const ab = await r.arrayBuffer()
          buffer = Buffer.from(ab)
          console.log('S3 success, size:', buffer.length)
        } else {
          const body = await r.text()
          lastError = `S3 failed: ${r.status} — ${body.slice(0, 100)}`
          console.log(lastError)
        }
      } catch (e) {
        lastError = `S3 exception: ${e.message}`
        console.log(lastError)
      }
    }

    if (!buffer || buffer.length < 1000) {
      throw new Error(`Toutes les strategies de telechargement ont echoue. Derniere erreur: ${lastError}`)
    }

    const data = parseDatabook(buffer)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Dashboard error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
