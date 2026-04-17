export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password, checkOnly } = req.body

  // Check password
  if (password !== process.env.UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' })
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN non configuré dans Vercel' })
  }

  // If checkOnly, return the credentials so the browser can upload directly to GitHub
  if (checkOnly) {
    return res.status(200).json({
      token,
      repo: 'mixuxu871/ramify-dashboard',
      path: 'public/databook.xlsb',
    })
  }

  return res.status(200).json({ success: true })
}
