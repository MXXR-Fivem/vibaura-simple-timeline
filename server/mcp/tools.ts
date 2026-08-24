// Surface MCP : les outils que les agents (Claude, Gemini, Codex) voient.
//
// Chaque outil délègue à la couche service — la même que celle qui sert l'UI —
// donc un agent est soumis exactement aux mêmes validations qu'un humain, et
// chacune de ses écritures laisse une entrée de journal réversible.
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/server'
import type { CallToolResult, StandardSchemaWithJSON } from '@modelcontextprotocol/server'
import { PATTERNS } from '../validation.js'
import { EVENT_KINDS, GRANULARITIES } from '../../shared/types.js'
import type { Actor } from '../backup.js'
import type { Mutated, Result } from '../services/base.js'
import { createProject, deleteProject, listProjects, updateProject } from '../services/projects.js'
import {
  createTimeline,
  deleteTimeline,
  listTimelines,
  updateTimeline,
} from '../services/timelines.js'
import { createEvent, deleteEvent, listEvents, updateEvent } from '../services/events.js'
import {
  createBackup,
  listBackups,
  listChanges,
  restoreBackup,
  rollback,
} from '../services/history.js'

// zod 4.4.3 expose bien `~standard.jsonSchema` à l'exécution (c'est par là que
// le SDK publie le schéma des arguments dans tools/list) mais ne le déclare pas
// encore dans ses types : la surcharge « Standard Schema » de registerTool ne
// matche donc pas. Ce pont rétablit le type attendu sans rien changer au
// runtime ; à supprimer dès que zod déclarera la propriété.
function argsOf<T extends z.ZodType>(schema: T): StandardSchemaWithJSON<z.input<T>, z.output<T>> {
  return schema as unknown as StandardSchemaWithJSON<z.input<T>, z.output<T>>
}

function json(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function oops(error: string): CallToolResult {
  return { content: [{ type: 'text', text: `erreur: ${error}` }], isError: true }
}

/** Rend le Result d'un service : l'entité écrite + l'identifiant pour la défaire. */
function mutation<T>(r: Result<Mutated<T>>, key: string): CallToolResult {
  if (!r.ok) return oops(r.error)
  return json({ ok: true, [key]: r.value.row, change_id: r.value.change?.id ?? null })
}

const idField = z.number().int().positive()
const dateField = z.string().regex(PATTERNS.date, 'date attendue au format YYYY-MM-DD')
const timeField = z.string().regex(PATTERNS.time, 'heure attendue au format HH:MM (24 h)')
const colorField = z.string().regex(PATTERNS.hexColor, 'couleur attendue au format #rrggbb')

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const

/**
 * Construit une instance d'outils liée à un dev. `actor` finit dans chaque
 * entrée de journal : on sait toujours quel token a écrit quoi.
 */
export function buildMcpServer(actor: Actor): McpServer {
  const server = new McpServer({ name: 'vibaura-timeline', version: '1.0.0' })

  // ---------- lecture ----------

  server.registerTool(
    'list_projects',
    {
      title: 'Lister les projets',
      description:
        'Tous les projets, du plus récemment modifié au plus ancien. Point de départ obligatoire : les autres outils travaillent avec des identifiants numériques, ne les invente pas.',
      inputSchema: argsOf(z.object({})),
      annotations: READ_ONLY,
    },
    async () => json(listProjects())
  )

  server.registerTool(
    'list_timelines',
    {
      title: 'Lister les frises d’un projet',
      description: 'Les frises chronologiques d’un projet, avec leur nombre d’évènements.',
      inputSchema: argsOf(z.object({ project_id: idField })),
      annotations: READ_ONLY,
    },
    async ({ project_id }) => json(listTimelines(project_id))
  )

  server.registerTool(
    'list_events',
    {
      title: 'Lister les évènements d’une frise',
      description: 'Les évènements d’une frise, triés par date de début.',
      inputSchema: argsOf(z.object({ timeline_id: idField })),
      annotations: READ_ONLY,
    },
    async ({ timeline_id }) => json(listEvents(timeline_id))
  )

  // ---------- projets ----------

  server.registerTool(
    'create_project',
    {
      title: 'Créer un projet',
      description: 'Crée un projet vide. Les frises se créent ensuite avec create_timeline.',
      inputSchema: argsOf(z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(4000).optional(),
      })),
      annotations: WRITE,
    },
    async (args) => mutation(createProject(actor, args), 'project')
  )

  server.registerTool(
    'update_project',
    {
      title: 'Modifier un projet',
      description: 'Modifie un projet. Les champs absents gardent leur valeur actuelle.',
      inputSchema: argsOf(z.object({
        id: idField,
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(4000).optional(),
      })),
      annotations: WRITE,
    },
    async ({ id, ...rest }) => mutation(updateProject(actor, id, rest), 'project')
  )

  server.registerTool(
    'delete_project',
    {
      title: 'Supprimer un projet',
      description:
        'Supprime un projet AVEC toutes ses frises et tous leurs évènements (cascade). Un instantané complet est pris avant ; le change_id renvoyé permet un rollback.',
      inputSchema: argsOf(z.object({ id: idField })),
      annotations: DESTRUCTIVE,
    },
    async ({ id }) => mutation(deleteProject(actor, id), 'deleted_project')
  )

  // ---------- frises ----------

  server.registerTool(
    'create_timeline',
    {
      title: 'Créer une frise',
      description:
        'Crée une frise dans un projet. start_date/end_date définissent le cadrage affiché ; granularity pilote les graduations.',
      inputSchema: argsOf(z.object({
        project_id: idField,
        name: z.string().min(1).max(200),
        start_date: dateField,
        end_date: dateField,
        description: z.string().max(4000).optional(),
        granularity: z.enum(GRANULARITIES).optional(),
        color: colorField.optional(),
      })),
      annotations: WRITE,
    },
    async ({ project_id, ...rest }) => mutation(createTimeline(actor, project_id, rest), 'timeline')
  )

  server.registerTool(
    'update_timeline',
    {
      title: 'Modifier une frise',
      description: 'Modifie une frise. Les champs absents gardent leur valeur actuelle.',
      inputSchema: argsOf(z.object({
        id: idField,
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(4000).optional(),
        start_date: dateField.optional(),
        end_date: dateField.optional(),
        granularity: z.enum(GRANULARITIES).optional(),
        color: colorField.optional(),
      })),
      annotations: WRITE,
    },
    async ({ id, ...rest }) => mutation(updateTimeline(actor, id, rest), 'timeline')
  )

  server.registerTool(
    'delete_timeline',
    {
      title: 'Supprimer une frise',
      description:
        'Supprime une frise AVEC tous ses évènements (cascade). Un instantané complet est pris avant ; le change_id renvoyé permet un rollback.',
      inputSchema: argsOf(z.object({ id: idField })),
      annotations: DESTRUCTIVE,
    },
    async ({ id }) => mutation(deleteTimeline(actor, id), 'deleted_timeline')
  )

  // ---------- évènements ----------

  server.registerTool(
    'create_event',
    {
      title: 'Ajouter un évènement',
      description:
        "Ajoute un évènement à une frise. kind='point' = jalon (un instant, end_date interdite) ; kind='period' = bloc (end_date obligatoire). Heures optionnelles : sans start_time l'évènement est sur la journée entière. Sans color, l'évènement hérite de la couleur de la frise.",
      inputSchema: argsOf(z.object({
        timeline_id: idField,
        title: z.string().min(1).max(300),
        kind: z.enum(EVENT_KINDS),
        start_date: dateField,
        description: z.string().max(4000).optional(),
        start_time: timeField.nullable().optional(),
        end_date: dateField.nullable().optional(),
        end_time: timeField.nullable().optional(),
        color: colorField.nullable().optional(),
      })),
      annotations: WRITE,
    },
    async ({ timeline_id, ...rest }) => mutation(createEvent(actor, timeline_id, rest), 'event')
  )

  server.registerTool(
    'update_event',
    {
      title: 'Modifier un évènement',
      description:
        'Modifie un évènement. Les champs absents gardent leur valeur actuelle ; passer null à start_time/end_time efface l’heure, null à color rend la couleur héritée.',
      inputSchema: argsOf(z.object({
        id: idField,
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(4000).optional(),
        kind: z.enum(EVENT_KINDS).optional(),
        start_date: dateField.optional(),
        start_time: timeField.nullable().optional(),
        end_date: dateField.nullable().optional(),
        end_time: timeField.nullable().optional(),
        color: colorField.nullable().optional(),
      })),
      annotations: WRITE,
    },
    async ({ id, ...rest }) => mutation(updateEvent(actor, id, rest), 'event')
  )

  server.registerTool(
    'delete_event',
    {
      title: 'Supprimer un évènement',
      description:
        'Supprime un évènement. Renvoie la ligne supprimée et un change_id à passer à rollback pour la remettre.',
      inputSchema: argsOf(z.object({ id: idField })),
      annotations: DESTRUCTIVE,
    },
    async ({ id }) => mutation(deleteEvent(actor, id), 'deleted_event')
  )

  // ---------- historique et sauvegardes ----------

  server.registerTool(
    'list_changes',
    {
      title: 'Lister les écritures récentes',
      description:
        'Journal des écritures (UI comprise), de la plus récente à la plus ancienne. Chaque entrée porte un id à passer à rollback.',
      inputSchema: argsOf(z.object({ limit: z.number().int().min(1).max(200).default(20) })),
      annotations: READ_ONLY,
    },
    async ({ limit }) => json(listChanges(limit))
  )

  server.registerTool(
    'rollback',
    {
      title: 'Défaire une écriture',
      description:
        "Défait une écriture du journal : réinsère ce qui a été supprimé, supprime ce qui a été créé, restaure les valeurs modifiées. Sans change_id, défait la plus récente. Si les lignes ont été retouchées depuis (par l'UI ou un autre agent), l'opération est refusée avec le détail du conflit — relancer avec force=true écrase alors leur travail. Le rollback est lui-même journalisé, donc réversible.",
      inputSchema: argsOf(z.object({
        change_id: z.string().optional(),
        force: z.boolean().default(false),
      })),
      annotations: DESTRUCTIVE,
    },
    async ({ change_id, force }) => {
      const r = rollback(actor, change_id ?? null, force)
      return r.ok ? json({ ok: true, ...r.value }) : oops(r.error)
    }
  )

  server.registerTool(
    'list_backups',
    {
      title: 'Lister les instantanés',
      description:
        'Instantanés complets de la base (JSON), du plus récent au plus ancien. Pris automatiquement avant chaque suppression en cascade et avant chaque restauration.',
      inputSchema: argsOf(z.object({})),
      annotations: READ_ONLY,
    },
    async () => json(listBackups())
  )

  server.registerTool(
    'create_backup',
    {
      title: 'Prendre un instantané',
      description:
        'Copie complète de la base dans un fichier JSON, à faire avant une série de modifications risquées.',
      inputSchema: argsOf(z.object({ label: z.string().max(60).optional() })),
      annotations: WRITE,
    },
    async ({ label }) => json({ ok: true, backup: createBackup(label ?? '') })
  )

  server.registerTool(
    'restore_backup',
    {
      title: 'Restaurer un instantané',
      description:
        "REMPLACE TOUT le contenu de la base par celui de l'instantané : tout ce qui a été fait depuis est perdu, y compris le travail des collègues dans l'UI. Préférer rollback pour défaire une écriture précise. Un instantané de sécurité est pris avant.",
      inputSchema: argsOf(z.object({ backup_id: z.string().min(1) })),
      annotations: DESTRUCTIVE,
    },
    async ({ backup_id }) => {
      const r = restoreBackup(actor, backup_id)
      return r.ok ? json({ ok: true, ...r.value }) : oops(r.error)
    }
  )

  return server
}
