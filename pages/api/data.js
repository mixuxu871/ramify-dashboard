const parseDatabook = require('../../lib/parseExcel')

export default async function handler(req, res) {
  try {
    // Read the databook from GitHub raw URL (public repo, no auth needed)
    const rawUrl = 'https://raw.githubusercontent.com/mixuxu871/ramify-dashboard/main/public/databook.xlsb'
    console.log('Fetching databook from GitHub...')

    const response = await fetch(rawUrl, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(30000),
    })

    console.log('GitHub response:', response.status, response.headers.get('content-type'))

    if (!response.ok) {
      throw new Error(
        `Fichier introuvable sur GitHub (${response.status}). ` +
        `Uploadez d'abord le databook via /upload.`
      )
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    console.log('File size:', buffer.length, 'bytes')

    if (buffer.length < 1000) {
      throw new Error(`Fichier trop petit (${buffer.length} octets)`)
    }

    const data = parseDatabook(buffer)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)

  } catch (err) {
    console.error('Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
