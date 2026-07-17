import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Project, ProjectInput } from '@shared/types'
import { api } from '../../../api'
import { Button } from '../../../ui/Button/Button'
import { Field } from '../../../ui/Field/Field'
import { FormError } from '../../../ui/FormError/FormError'
import { Modal } from '../../../ui/Modal/Modal'

export interface ProjectFormProps {
  /** null => création. */
  project: Project | null
  onClose: () => void
  onSaved: () => void
}

/** Création / édition d'un projet, en modale. */
export function ProjectForm({ project, onClose, onSaved }: ProjectFormProps) {
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
      const data: ProjectInput = { name: name.trim(), description }
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
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <Field label="Nom" htmlFor={`${uid}-name`}>
        <input
          id={`${uid}-name`}
          autoFocus
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          placeholder="Ex : Refonte site"
        />
      </Field>
      <Field label="Description" htmlFor={`${uid}-desc`}>
        <textarea
          id={`${uid}-desc`}
          rows={3}
          value={description}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          placeholder="Optionnel"
        />
      </Field>
      {error && <FormError>{error}</FormError>}
    </Modal>
  )
}
