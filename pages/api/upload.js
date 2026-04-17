export const config = {
  api: { bodyParser: { sizeLimit: '50mb' } },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password, fileBase64 } = req.body

  // Check password
  if (password !== process.env.UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' })
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN non configuré dans Vercel' })
  }

  const repo  = 'mixuxu871/ramify-dashboard'
  const path  = 'public/databook.xlsb'
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`

  try {
    // Get current file SHA (needed to update an existing file)
    let sha
    const getRes = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    })
    if (getRes.ok) {
      const existing = await getRes.json()
      sha = existing.sha
    }

    // Push file to GitHub
    const body = {
      message: `Update databook ${new Date().toLocaleDateString('fr-FR')}`,
      content: fileBase64,
      ...(sha ? { sha } : {}),
    }

    const pushRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!pushRes.ok) {
      const err = await pushRes.json()
      throw new Error(err.message || 'Erreur GitHub API')
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Upload error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
