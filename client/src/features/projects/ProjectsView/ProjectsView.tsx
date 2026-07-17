import { useCallback, useState } from 'react'
import type { Project, ProjectListItem } from '@shared/types'
import { api } from '../../../api'
import { navigate, routes } from '../../../lib/router'
import { usePolling } from '../../../hooks/usePolling'
import { ProjectForm } from '../ProjectForm/ProjectForm'
import { Button } from '../../../ui/Button/Button'
import { IconButton } from '../../../ui/IconButton/IconButton'
import { EmptyState } from '../../../ui/EmptyState/EmptyState'
import { IndexList, IndexRow } from '../../../ui/IndexList/IndexList'
import { Loading } from '../../../ui/Loading/Loading'
import { Page, PageHeader } from '../../../ui/Page/Page'
import { IconEdit, IconFolder, IconPlus, IconTrash } from '../../../ui/Icons/Icons'
import s from './ProjectsView.module.css'

/** Racine de l'application : la liste des projets. */
export function ProjectsView() {
  // null => pas encore chargé (distinct de la liste vide).
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  // 'new' => création ; un projet => édition de celui-ci.
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  const load = useCallback(() => api.listProjects().then(setProjects).catch(() => {}), [])
  usePolling(load, 8000)

  async function remove(p: ProjectListItem) {
    if (!window.confirm(`Supprimer le projet « ${p.name} » et toutes ses timelines ?`)) return
    await api.deleteProject(p.id)
    load()
  }

  return (
    <Page>
      <PageHeader
        title="Projets"
        description="Vos chantiers, chacun avec ses timelines."
        action={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <IconPlus /> Nouveau projet
          </Button>
        }
      />

      {projects === null ? (
        <Loading />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<IconFolder width={40} height={40} />}
          message="Aucun projet pour l'instant."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              <IconPlus /> Créer le premier projet
            </Button>
          }
        />
      ) : (
        <IndexList>
          {projects.map((p) => (
            <IndexRow
              key={p.id}
              title={p.name}
              subtitle={p.description ? <div className={s.desc}>{p.description}</div> : null}
              meta={`${p.timeline_count} timeline${p.timeline_count > 1 ? 's' : ''}`}
              actions={
                <>
                  <IconButton size="sm" title="Modifier" onClick={() => setEditing(p)}>
                    <IconEdit width={15} height={15} />
                  </IconButton>
                  <IconButton size="sm" tone="danger" title="Supprimer" onClick={() => remove(p)}>
                    <IconTrash width={15} height={15} />
                  </IconButton>
                </>
              }
              onClick={() => navigate(routes.timelines(p.id))}
            />
          ))}
        </IndexList>
      )}

      {editing && (
        <ProjectForm
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </Page>
  )
}
