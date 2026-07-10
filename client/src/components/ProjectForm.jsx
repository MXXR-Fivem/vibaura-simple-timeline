import { useId, useState } from 'react'
import { api } from '../api.js'
import Modal from './Modal.jsx'

export default function ProjectForm({ project, onClose, onSaved }) {
  const uid = useId()
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) {
      setError('Le nom est requis.')
      return
    }
    setBusy(true)
    try {
      const data = { name: name.trim(), description }
      if (project) await api.updateProject(project.id, data)
      else await api.createProject(data)
      onSaved()
    } catch {
      setError("Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <Modal
      title={project ? 'Modifier le projet' : 'Nouveau projet'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor={`${uid}-name`}>Nom</label>
        <input
          id={`${uid}-name`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Refonte site"
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-desc`}>Description</label>
        <textarea
          id={`${uid}-desc`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optionnel"
        />
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  )
}
