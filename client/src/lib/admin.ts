/**
 * The operator's admin view: its token, the two reads behind it, the queues of
 * suggestions and reports, and the pack question editor's changes.
 *
 * The token arrives once, in the fragment of `/admin#token=…`. A fragment never reaches
 * the server, so it stays out of the access log and out of any `Referer`. It is moved into
 * localStorage and out of the address bar on that first load, and from then on travels
 * only as `Authorization: Bearer`. Home links here only for a browser that holds one.
 */

import { ApiFailure } from './api'
import { dropStored, readStored, writeStored } from './session'
import type { QuestionChange, QuestionEdit } from './questionEdits'
import type { PackQuestion, QueuedReport, ReportStatus } from './reports'
import type { RosterChange, RosterItem } from './rosterEdits'
import type { QueuedSuggestion, SuggestionBody, SuggestionStatus } from './suggestions'

const TOKEN_KEY = 'jbi:admin'

/** The admin page's tabs, each at its own path so a reload or a link lands on it. */
export const ADMIN_TABS = ['overview', 'suggestions', 'reports', 'questions', 'roster'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

/** `/admin` is the overview, `/admin/<tab>` any other tab; null for a path that is neither. */
export function adminTabOf(path: string): AdminTab | null {
  if (path === '/admin') return 'overview'
  const tab = /^\/admin\/([a-z]+)$/.exec(path)?.[1]
  return tab !== 'overview' && (ADMIN_TABS as readonly string[]).includes(tab ?? '')
    ? (tab as AdminTab)
    : null
}

export function adminPath(tab: AdminTab): string {
  return tab === 'overview' ? '/admin' : `/admin/${tab}`
}

export interface LiveRound {
  index: number
  total: number
  mode: string
}

export interface LiveRoom {
  code: string
  status: 'lobby' | 'playing' | 'finished'
  round: LiveRound | null
  connected: number
  players: number
  waiting: boolean
  created_at: string
  deletes_at: string
}

export interface Live {
  rooms: LiveRoom[]
  sockets: number
}

/** One day's count of one metric, keyed by mode where that matters. */
export interface Count {
  day: string
  metric: string
  key: string
  count: number
}

/**
 * The token in the address bar, moved into storage, or else the stored one.
 *
 * Any fragment is cleared from the address bar, so a token never sits there to be
 * shared in a screenshot or kept in the history.
 */
export function takeAdminToken(): string | null {
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('token')
  if (location.hash !== '') history.replaceState(history.state, '', location.pathname)
  if (fromLink !== null && fromLink !== '') {
    writeStored(TOKEN_KEY, fromLink)
    return fromLink
  }
  return readStored(TOKEN_KEY)
}

/** The token this browser holds, which is not to say the server still takes it. */
export function storedAdminToken(): string | null {
  return readStored(TOKEN_KEY)
}

/** Whether this browser holds a token, which is not to say the server still takes it. */
export function hasAdminToken(): boolean {
  return storedAdminToken() !== null
}

export function forgetAdminToken(): void {
  dropStored(TOKEN_KEY)
}

async function adminRequest<T>(
  path: string,
  token: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiFailure(0, 'unreachable', 'cannot reach the server')
  }
  if (!response.ok) {
    const fault = ((await response.json().catch(() => null)) ?? {}) as {
      code?: unknown
      message?: unknown
    }
    throw new ApiFailure(
      response.status,
      typeof fault.code === 'string' ? fault.code : 'error',
      typeof fault.message === 'string' ? fault.message : `request failed (${response.status})`,
    )
  }
  return (await response.json()) as T
}

function adminGet<T>(path: string, token: string): Promise<T> {
  return adminRequest<T>(path, token)
}

export function getLive(token: string): Promise<Live> {
  return adminGet('/api/admin/rooms', token)
}

export async function getCounts(token: string): Promise<Count[]> {
  return (await adminGet<{ counts: Count[] }>('/api/admin/stats', token)).counts
}

export interface Queue {
  suggestions: QueuedSuggestion[]
  counts: Record<SuggestionStatus, number>
}

export function getQueue(token: string, status: SuggestionStatus): Promise<Queue> {
  return adminGet(`/api/admin/suggestions?status=${status}`, token)
}

export function editSuggestion(
  token: string,
  id: string,
  body: Omit<SuggestionBody, 'kind'>,
): Promise<QueuedSuggestion> {
  return adminRequest(`/api/admin/suggestions/${encodeURIComponent(id)}`, token, 'PUT', body)
}

export function setSuggestionStatus(
  token: string,
  id: string,
  status: 'pending' | 'approved' | 'rejected',
): Promise<QueuedSuggestion> {
  return adminRequest(`/api/admin/suggestions/${encodeURIComponent(id)}/status`, token, 'POST', {
    status,
  })
}

/** The file for `make import-suggestions`. Exporting the approved ones marks them exported. */
export function exportSuggestions(
  token: string,
  status: 'approved' | 'imported',
): Promise<unknown> {
  return adminRequest('/api/admin/suggestions/export', token, 'POST', { status })
}

/** Move what the last export downloaded to imported. */
export async function markImported(token: string): Promise<number> {
  const path = '/api/admin/suggestions/imported'
  return (await adminRequest<{ imported: number }>(path, token, 'POST', {})).imported
}

export interface ReportQueue {
  reports: QueuedReport[]
  counts: Record<ReportStatus, number>
}

export function getReports(token: string, status: ReportStatus): Promise<ReportQueue> {
  return adminGet(`/api/admin/reports?status=${status}`, token)
}

export function setReportStatus(
  token: string,
  id: string,
  status: ReportStatus,
): Promise<QueuedReport> {
  return adminRequest(`/api/admin/reports/${encodeURIComponent(id)}/status`, token, 'POST', {
    status,
  })
}

/** A mode's pack questions whole, answers included. */
export async function getPackQuestions(token: string, mode: string): Promise<PackQuestion[]> {
  const path = `/api/admin/questions?mode=${encodeURIComponent(mode)}`
  return (await adminGet<{ questions: PackQuestion[] }>(path, token)).questions
}

/** The modes whose pack questions the editor lists. */
export function getEditModes(token: string): Promise<string[]> {
  return adminGet('/api/admin/questions/modes', token)
}

/** Queue an edit of a pack question, replacing any change already queued for it. */
export function editPackQuestion(
  token: string,
  id: string,
  edit: QuestionEdit,
): Promise<QuestionChange> {
  return adminRequest(`/api/admin/questions/${encodeURIComponent(id)}`, token, 'PUT', edit)
}

/** Queue the removal of a pack question. */
export function deletePackQuestion(token: string, id: string): Promise<QuestionChange> {
  return adminRequest(`/api/admin/questions/${encodeURIComponent(id)}`, token, 'DELETE', {})
}

export async function getQuestionChanges(token: string): Promise<QuestionChange[]> {
  const path = '/api/admin/question-changes'
  return (await adminGet<{ changes: QuestionChange[] }>(path, token)).changes
}

export async function discardQuestionChange(token: string, id: string): Promise<void> {
  const path = `/api/admin/question-changes/${encodeURIComponent(id)}`
  await adminRequest(path, token, 'DELETE', {})
}

/** The file for `make edit-packs`. Every change it holds is marked exported. */
export function exportQuestionChanges(token: string): Promise<unknown> {
  return adminRequest('/api/admin/question-changes/export', token, 'POST', {})
}

/** Drop the changes the last download held, once they are applied and committed. */
export async function markQuestionChangesApplied(token: string): Promise<number> {
  const path = '/api/admin/question-changes/applied'
  return (await adminRequest<{ applied: number }>(path, token, 'POST', {})).applied
}

/** The popular items, in the roster's order. */
export async function getRosterItems(token: string): Promise<RosterItem[]> {
  return (await adminGet<{ items: RosterItem[] }>('/api/admin/roster', token)).items
}

/** Queue a rename of a roster item, replacing any change already queued for it. */
export function renameRosterItem(token: string, id: number, name: string): Promise<RosterChange> {
  return adminRequest(`/api/admin/roster/${id}`, token, 'PUT', { name })
}

/** Queue the removal of a roster item. */
export function removeRosterItem(token: string, id: number): Promise<RosterChange> {
  return adminRequest(`/api/admin/roster/${id}`, token, 'DELETE', {})
}

export async function getRosterChanges(token: string): Promise<RosterChange[]> {
  return (await adminGet<{ changes: RosterChange[] }>('/api/admin/roster-changes', token)).changes
}

export async function discardRosterChange(token: string, id: number): Promise<void> {
  await adminRequest(`/api/admin/roster-changes/${id}`, token, 'DELETE', {})
}

/** The file for `make edit-roster`. Every change it holds is marked exported. */
export function exportRosterChanges(token: string): Promise<unknown> {
  return adminRequest('/api/admin/roster-changes/export', token, 'POST', {})
}

/** Drop the changes the last download held, once they are applied and committed. */
export async function markRosterChangesApplied(token: string): Promise<number> {
  const path = '/api/admin/roster-changes/applied'
  return (await adminRequest<{ applied: number }>(path, token, 'POST', {})).applied
}

/** Hand `value` to the browser as a JSON file named `name`. */
export function downloadJson(value: unknown, name: string): void {
  const text = `${JSON.stringify(value, null, 2)}\n`
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** The refresh button's label: how many seconds ago the data was fetched, once it has been. */
export function refreshLabel(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return 'Refresh'
  return `Refresh · ${Math.max(0, Math.floor((now - updatedAt) / 1000))}s ago`
}

/** How long until `iso`, coarsely: "41 min", "2 d 23 h", "now". */
export function timeUntil(iso: string, now: number): string {
  const minutes = Math.floor((Date.parse(iso) - now) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}
