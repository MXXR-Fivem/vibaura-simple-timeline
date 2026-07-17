// Contrat d'API partagé par le serveur (ce qu'il renvoie) et le client (ce qu'il
// consomme). Fichier volontairement sans code exécutable : uniquement des types,
// pour qu'aucune des deux moitiés ne dépende de l'implémentation de l'autre.
//
// Les noms de champs sont ceux des colonnes SQLite (snake_case) : l'API expose
// les lignes telles quelles, y compris `SELECT *`.

/** Date calendaire « YYYY-MM-DD ». */
export type IsoDate = string
/** Heure murale « HH:MM » (24 h). */
export type IsoTime = string
/** Horodatage ISO 8601 complet (colonnes created_at / updated_at). */
export type IsoTimestamp = string
/** Couleur « #rrggbb ». */
export type HexColor = string

export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'] as const
export type Granularity = (typeof GRANULARITIES)[number]

export const EVENT_KINDS = ['point', 'period'] as const
/** `point` = jalon (un instant), `period` = bloc (une plage de jours). */
export type EventKind = (typeof EVENT_KINDS)[number]

// ---------- entités ----------

export interface Project {
  id: number
  name: string
  description: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/** Ligne de la liste des projets : agrège le nombre de timelines. */
export interface ProjectListItem extends Project {
  timeline_count: number
}

export interface Timeline {
  id: number
  project_id: number
  name: string
  description: string
  start_date: IsoDate
  end_date: IsoDate
  granularity: Granularity
  color: HexColor
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/** Ligne de la liste des timelines : agrège le nombre d'évènements. */
export interface TimelineListItem extends Timeline {
  event_count: number
}

/**
 * Évènement d'une frise. Nommé `TimelineEvent` et non `Event` pour ne pas entrer
 * en collision avec l'`Event` du DOM côté client.
 *
 * Invariants garantis par le serveur (server/routes/events.ts) :
 * - `kind: 'point'`  => `end_date` et `end_time` sont toujours null ;
 * - `kind: 'period'` => `end_date` est non null (`end_time` reste optionnelle) ;
 * - `color: null`    => hérite de la couleur de la timeline.
 */
export interface TimelineEvent {
  id: number
  timeline_id: number
  title: string
  description: string
  kind: EventKind
  start_date: IsoDate
  start_time: IsoTime | null
  end_date: IsoDate | null
  end_time: IsoTime | null
  color: HexColor | null
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

// ---------- charges utiles ----------

export interface ProjectInput {
  name: string
  description?: string
}

export interface TimelineInput {
  name: string
  description?: string
  start_date: IsoDate
  end_date: IsoDate
  granularity?: Granularity
  color?: HexColor
}

export interface EventInput {
  title: string
  description?: string
  kind: EventKind
  start_date: IsoDate
  /** null ou '' efface l'heure (journée entière). */
  start_time?: IsoTime | null
  end_date?: IsoDate | null
  end_time?: IsoTime | null
  /** null => couleur héritée de la timeline. */
  color?: HexColor | null
}

/** PATCH : tous les champs sont optionnels, le serveur conserve l'existant. */
export type ProjectPatch = Partial<ProjectInput>
export type TimelinePatch = Partial<TimelineInput>
export type EventPatch = Partial<EventInput>

// ---------- réponses ----------

export interface SessionResponse {
  user: string
}

export interface LogoutResponse {
  ok: true
}

/** Corps renvoyé avec tout statut 4xx/5xx de l'API. */
export interface ErrorResponse {
  error: string
}
