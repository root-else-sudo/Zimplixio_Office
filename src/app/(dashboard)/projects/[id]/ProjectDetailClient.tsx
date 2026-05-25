'use client'

import { useState, useCallback } from 'react'
import { Gantt, ViewMode } from 'gantt-task-react'
import type { Task as GanttTask } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle, AlertCircle, Clock, Ban,
  ChevronDown, Loader2, Check, X, Sparkles,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskDep = { requiredTaskId: string }

type DBTask = {
  id: string
  name: string
  description: string | null
  status: string
  startDate: string
  endDate: string
  order: number
  blockReason: string | null
  proposedBy: string | null
  dependencies: TaskDep[]
}

type DBPhase = {
  id: string
  name: string
  color: string | null
  order: number
  tasks: DBTask[]
}

type DBProject = {
  id: string
  name: string
  description: string | null
  status: string
  color: string
  phases: DBPhase[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; progress: string; text: string; badge: string }> = {
  TODO:             { bg: '#e5e7eb', progress: '#9ca3af', text: 'text-gray-500',   badge: 'bg-gray-100 text-gray-500' },
  IN_PROGRESS:      { bg: '#c7d2fe', progress: '#6366f1', text: 'text-indigo-600', badge: 'bg-indigo-50 text-indigo-600' },
  BLOCKED:          { bg: '#fecaca', progress: '#ef4444', text: 'text-red-500',    badge: 'bg-red-50 text-red-500' },
  DONE:             { bg: '#a7f3d0', progress: '#10b981', text: 'text-emerald-600',badge: 'bg-emerald-50 text-emerald-600' },
  PENDING_APPROVAL: { bg: '#fde68a', progress: '#f59e0b', text: 'text-amber-600',  badge: 'bg-amber-50 text-amber-600' },
}

function statusLabel(s: string) {
  return { TODO: 'To Do', IN_PROGRESS: 'In Progress', BLOCKED: 'Blocked', DONE: 'Done', PENDING_APPROVAL: 'Pending Approval' }[s] ?? s
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'DONE')             return <CheckCircle className="w-4 h-4 text-emerald-500" />
  if (status === 'BLOCKED')          return <Ban className="w-4 h-4 text-red-400" />
  if (status === 'IN_PROGRESS')      return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
  if (status === 'PENDING_APPROVAL') return <Sparkles className="w-4 h-4 text-amber-500" />
  return <Clock className="w-4 h-4 text-gray-400" />
}

function dbToGantt(project: DBProject): GanttTask[] {
  const tasks: GanttTask[] = []

  for (const phase of project.phases) {
    const phaseTasks = phase.tasks
    const phaseStart = phaseTasks.length > 0
      ? new Date(Math.min(...phaseTasks.map(t => new Date(t.startDate).getTime())))
      : new Date()
    const phaseEnd = phaseTasks.length > 0
      ? new Date(Math.max(...phaseTasks.map(t => new Date(t.endDate).getTime())))
      : new Date(Date.now() + 86400000)

    tasks.push({
      id: phase.id,
      name: phase.name,
      start: phaseStart,
      end: phaseEnd,
      progress: phaseTasks.length > 0
        ? Math.round((phaseTasks.filter(t => t.status === 'DONE').length / phaseTasks.length) * 100)
        : 0,
      type: 'project',
      hideChildren: false,
      styles: {
        backgroundColor: phase.color ?? project.color,
        backgroundSelectedColor: phase.color ?? project.color,
        progressColor: phase.color ?? project.color,
      },
    })

    for (const task of phaseTasks) {
      const isPending = task.status === 'PENDING_APPROVAL'
      const colors = STATUS_COLORS[task.status] ?? STATUS_COLORS.TODO
      tasks.push({
        id: task.id,
        name: task.name,
        start: new Date(task.startDate),
        end: new Date(task.endDate),
        progress: task.status === 'DONE' ? 100 : task.status === 'IN_PROGRESS' ? 50 : 0,
        type: 'task',
        project: phase.id,
        isDisabled: isPending,
        dependencies: task.dependencies.map(d => d.requiredTaskId),
        styles: {
          backgroundColor: colors.bg,
          backgroundSelectedColor: colors.bg,
          progressColor: colors.progress,
          progressSelectedColor: colors.progress,
        },
      })
    }
  }

  return tasks
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectDetailClient({
  project: initialProject,
  isAdmin,
}: {
  project: DBProject
  isAdmin: boolean
}) {
  const [project, setProject] = useState(initialProject)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [saving, setSaving] = useState(false)

  const allTasks = project.phases.flatMap(p => p.tasks)
  const selectedTask = allTasks.find(t => t.id === selectedTaskId) ?? null
  const pendingCount = allTasks.filter(t => t.status === 'PENDING_APPROVAL').length

  const ganttTasks = dbToGantt(project)

  const refreshProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}`)
    if (res.ok) setProject(await res.json())
  }, [project.id])

  async function handleDateChange(ganttTask: GanttTask) {
    if (ganttTask.type === 'project') return
    setSaving(true)
    await fetch(`/api/tasks/${ganttTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: ganttTask.start.toISOString(),
        endDate: ganttTask.end.toISOString(),
      }),
    })
    await refreshProject()
    setSaving(false)
  }

  async function handleStatusChange(taskId: string, status: string) {
    setSaving(true)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await refreshProject()
    setSelectedTaskId(taskId)
    setSaving(false)
  }

  async function handleApprove(taskId: string) {
    setSaving(true)
    await fetch(`/api/tasks/${taskId}/approve`, { method: 'POST' })
    await refreshProject()
    setSelectedTaskId(taskId)
    setSaving(false)
  }

  async function handleReject(taskId: string) {
    setSaving(true)
    await fetch(`/api/tasks/${taskId}/reject`, { method: 'POST' })
    await refreshProject()
    setSelectedTaskId(null)
    setSaving(false)
  }

  function handleTaskClick(ganttTask: GanttTask) {
    if (ganttTask.type === 'project') return
    setSelectedTaskId(prev => prev === ganttTask.id ? null : ganttTask.id)
  }

  const done = allTasks.filter(t => t.status === 'DONE').length
  const total = allTasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-7 md:px-10 pt-7 pb-5 border-b border-gray-100">
        <div className="max-w-full flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/projects" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
            <div>
              <p className="eyebrow">Projects</p>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
                {project.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1 shrink-0">
            {saving && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
            {pendingCount > 0 && (
              <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-xl">
                {pendingCount} pending approval
              </span>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{pct}% complete</span>
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: project.color }} />
              </div>
            </div>
            {/* View mode selector */}
            <div className="relative">
              <select
                value={viewMode}
                onChange={e => setViewMode(e.target.value as ViewMode)}
                className="text-xs text-gray-600 bg-white border border-gray-200 rounded-xl pl-3 pr-7 py-1.5 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value={ViewMode.Day}>Day</option>
                <option value={ViewMode.Week}>Week</option>
                <option value={ViewMode.Month}>Month</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Gantt */}
        <div className="flex-1 overflow-auto gantt-wrapper">
          {ganttTasks.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
              No tasks yet — add phases and tasks to get started.
            </div>
          ) : (
            <Gantt
              tasks={ganttTasks}
              viewMode={viewMode}
              onDateChange={handleDateChange}
              onClick={handleTaskClick}
              listCellWidth="200px"
              rowHeight={40}
              headerHeight={50}
              barCornerRadius={6}
              barFill={65}
              todayColor="rgba(99,102,241,0.08)"
              arrowColor="#6366f1"
              fontFamily="inherit"
              fontSize="12px"
            />
          )}
        </div>

        {/* Task detail sidebar */}
        {selectedTask && (
          <div className="w-72 shrink-0 border-l border-gray-100 overflow-y-auto">
            <TaskSidebar
              task={selectedTask}
              isAdmin={isAdmin}
              saving={saving}
              onStatusChange={handleStatusChange}
              onApprove={handleApprove}
              onReject={handleReject}
              onClose={() => setSelectedTaskId(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Task Sidebar ──────────────────────────────────────────────────────────────

function TaskSidebar({
  task, isAdmin, saving,
  onStatusChange, onApprove, onReject, onClose,
}: {
  task: DBTask
  isAdmin: boolean
  saving: boolean
  onStatusChange: (id: string, s: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onClose: () => void
}) {
  const colors = STATUS_COLORS[task.status] ?? STATUS_COLORS.TODO
  const isPending = task.status === 'PENDING_APPROVAL'

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{task.name}</p>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
      )}

      {/* Pending approval banner */}
      {isPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <p className="text-xs font-medium text-amber-700">Proposed by {task.proposedBy ?? 'agent'}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(task.id)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 hover:bg-emerald-100 transition-colors disabled:opacity-40"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={() => onReject(task.id)}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg py-1.5 hover:bg-red-100 transition-colors disabled:opacity-40"
              >
                <X className="w-3 h-3" /> Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      {!isPending && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const).map(s => {
              const c = STATUS_COLORS[s]
              const active = task.status === s
              return (
                <button
                  key={s}
                  disabled={!isAdmin || saving}
                  onClick={() => onStatusChange(task.id, s)}
                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50 ${
                    active
                      ? `${c.badge} border-current`
                      : 'text-gray-400 bg-gray-50 border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {active && <StatusIcon status={s} />}
                  {statusLabel(s)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Block reason */}
      {task.status === 'BLOCKED' && task.blockReason && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            <p className="text-xs font-medium text-red-600">Blocker</p>
          </div>
          <p className="text-xs text-red-500">{task.blockReason}</p>
        </div>
      )}

      {/* Dates */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Timeline</p>
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Start</span>
            <span>{new Date(task.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">End</span>
            <span>{new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${colors.badge}`}>
        <StatusIcon status={task.status} />
        {statusLabel(task.status)}
      </div>
    </div>
  )
}
