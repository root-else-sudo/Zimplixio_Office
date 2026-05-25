import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FolderKanban, Plus, CheckCircle, Clock, Archive } from 'lucide-react'

export default async function ProjectsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      phases: {
        include: { tasks: { select: { id: true, status: true } } },
      },
    },
  })

  return (
    <div className="p-7 md:p-10 max-w-6xl mx-auto space-y-7">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Management</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
            Projects
          </h1>
        </div>
        {session.user.role === 'ADMIN' && (
          <Link href="/projects/new" className="btn-primary mt-1">
            <Plus className="w-4 h-4" /> New Project
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="soft-card p-12 text-center">
          <FolderKanban className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No projects yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a project to start tracking work on a Gantt chart.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => {
            const allTasks = project.phases.flatMap(p => p.tasks)
            const done = allTasks.filter(t => t.status === 'DONE').length
            const total = allTasks.length
            const pending = allTasks.filter(t => t.status === 'PENDING_APPROVAL').length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0

            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="soft-card p-5 flex flex-col gap-4 soft-card-hover cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
                    <p className="font-semibold text-gray-900 text-sm leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                      {project.name}
                    </p>
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                {project.description && (
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{project.description}</p>
                )}

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{done} / {total} tasks done</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: project.color }} />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />{project.phases.length} phases
                  </span>
                  {pending > 0 && (
                    <span className="flex items-center gap-1 text-amber-500 font-medium">
                      {pending} pending approval
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') return (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
      <CheckCircle className="w-3 h-3" /> Done
    </span>
  )
  if (status === 'ARCHIVED') return (
    <span className="flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
      <Archive className="w-3 h-3" /> Archived
    </span>
  )
  return (
    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">Active</span>
  )
}
