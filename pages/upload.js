import { useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default function Upload() {
  const [password, setPassword]   = useState('')
  const [status, setStatus]       = useState(null) // null | 'loading' | 'success' | 'error'
  const [message, setMessage]     = useState('')
  const [fileName, setFileName]   = useState('')
  const fileRef = useRef()

  async function handleSubmit(e) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return setMessage('Sélectionnez un fichier')

    setStatus('loading')
    setMessage('Envoi en cours...')

    try {
      // Read file as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Check password via our API first
      const checkRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, checkOnly: true }),
      })
      const checkJson = await checkRes.json()
      if (!checkRes.ok) throw new Error(checkJson.error)

      // Upload directly to GitHub API from browser (bypasses Vercel 4.5MB limit)
      const { token, repo, path } = checkJson

      // Get current SHA
      let sha
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      })
      if (getRes.ok) {
        const existing = await getRes.json()
        sha = existing.sha
      }

      // Push file
      const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update databook ${new Date().toLocaleDateString('fr-FR')}`,
          content: base64,
          ...(sha ? { sha } : {}),
        }),
      })

      const json = await pushRes.json()
      if (!pushRes.ok) throw new Error(json.message || 'Erreur GitHub')

      setStatus('success')
      setMessage('✅ Databook mis à jour ! Le dashboard se rafraîchit dans 1-2 minutes.')
    } catch (err) {
      setStatus('error')
      setMessage(`❌ Erreur : ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Head>
        <title>Ramify — Mettre à jour le databook</title>
      </Head>

      <div className="bg-white rounded-2xl shadow-md border border-gray-200 w-full max-w-md p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Mettre à jour le databook</h1>
          <p className="text-sm text-gray-500 mt-1">
            Uploadez la dernière version du fichier Excel pour mettre à jour le dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fichier Excel (.xlsb / .xlsx)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsb,.xlsx,.xlsm"
              onChange={e => setFileName(e.target.files?.[0]?.name || '')}
              className="block w-full text-sm text-gray-500
                file:mr-3 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-gray-400 mt-1">📎 {fileName}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm"
          >
            {status === 'loading' ? 'Envoi...' : 'Mettre à jour'}
          </button>
        </form>

        {/* Status message */}
        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            status === 'success' ? 'bg-green-50 text-green-700' :
            status === 'error'   ? 'bg-red-50 text-red-700' :
            'bg-blue-50 text-blue-700'
          }`}>
            {message}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Retour au dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
