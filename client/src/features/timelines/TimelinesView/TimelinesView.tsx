import { useCallback, useState } from 'react'
import type { Timeline, TimelineListItem } from '@shared/types'
import { api } from '../../../api'
import { useEntity } from '../../../hooks/useEntity'
import { usePolling } from '../../../hooks/usePolling'
import { colorForIndex } from '../../../lib/colors'
import { formatLong } from '../../../lib/dates'
import { navigate, routes } from '../../../lib/router'
import { BackLink } from '../../../ui/BackLink/BackLink'
import { Button } from '../../../ui/Button/Button'
import { EmptyState } from '../../../ui/EmptyState/EmptyState'
import { IconButton } from '../../../ui/IconButton/IconButton'
import { IconCalendar, IconEdit, IconPlus, IconTrash } from '../../../ui/Icons/Icons'
import { IndexList, IndexRow } from '../../../ui/IndexList/IndexList'
import { Loading } from '../../../ui/Loading/Loading'
import { Page, PageHeader } from '../../../ui/Page/Page'
import { TimelineForm } from '../TimelineForm/TimelineForm'
import s from './TimelinesView.module.css'

export interface TimelinesViewProps {
  projectId: number
}

/** Liste des timelines d'un projet. */
export function TimelinesView({ projectId }: TimelinesViewProps) {
  const project = useEntity(() => api.getProject(projectId), [projectId])
  const [timelines, setTimelines] = useState<TimelineListItem[] | null>(null)
  const [editing, setEditing] = useState<Timeline | 'new' | null>(null)

  const loadTimelines = useCallback(
    () => api.listTimelines(projectId).then(setTimelines).catch(() => {}),
    [projectId]
  )
  usePolling(loadTimelines, 8000)

  async function remove(tl: TimelineListItem) {
    if (!window.confirm(`Supprimer la timeline « ${tl.name} » et ses évènements ?`)) return
    await api.deleteTimeline(tl.id)
    loadTimelines()
  }

  const backLink = <BackLink onClick={() => navigate(routes.projects())}>Projets</BackLink>

  if (project.status === 'missing') {
    return (
      <Page>
        {backLink}
        <EmptyState message="Projet introuvable." />
      </Page>
    )
  }

  if (project.status === 'error') {
    return (
      <Page>
        {backLink}
        <EmptyState
          message="Impossible de charger ce projet."
          action={<Button onClick={() => project.reload()}>Réessayer</Button>}
        />
      </Page>
    )
  }

  return (
    <>
      <Page>
        {backLink}

        <PageHeader
          title={project.entity?.name || '…'}
          description={project.entity?.description || undefined}
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              <IconPlus /> Nouvelle timeline
            </Button>
          }
        />

        {timelines === null ? (
          <Loading />
        ) : timelines.length === 0 ? (
          <EmptyState
            icon={<IconCalendar width={40} height={40} />}
            message="Aucune timeline dans ce projet."
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                <IconPlus /> Créer une timeline
              </Button>
            }
          />
        ) : (
          <IndexList>
            {timelines.map((tl) => (
              <IndexRow
                key={tl.id}
                leading={<span className={s.dot} style={{ background: tl.color }} />}
                title={tl.name}
                subtitle={
                  <div className={s.sub}>
                    {formatLong(tl.start_date)} <span className={s.arrow}>→</span> {formatLong(tl.end_date)}
                  </div>
                }
                meta={`${tl.event_count} évènement${tl.event_count > 1 ? 's' : ''}`}
                actions={
                  <>
                    <IconButton size="sm" title="Modifier" onClick={() => setEditing(tl)}>
                      <IconEdit width={15} height={15} />
                    </IconButton>
                    <IconButton size="sm" tone="danger" title="Supprimer" onClick={() => remove(tl)}>
                      <IconTrash width={15} height={15} />
                    </IconButton>
                  </>
                }
                onClick={() => navigate(routes.timeline(projectId, tl.id))}
              />
            ))}
          </IndexList>
        )}
      </Page>

      {editing && (
        <TimelineForm
          projectId={projectId}
          timeline={editing === 'new' ? null : editing}
          defaultColor={colorForIndex(timelines?.length || 0)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadTimelines()
          }}
        />
      )}
    </>
  )
}
