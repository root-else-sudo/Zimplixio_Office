'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, FileText, CheckCircle } from 'lucide-react'

type Post = {
  id: string
  newsletter: string
  sourceSubject: string
  content: string
  status: string
  createdAt: string
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarClient({ posts }: { posts: Post[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)

  const postsByDay = useMemo(() => {
    const map: Record<string, Post[]> = {}
    for (const post of posts) {
      const d = new Date(post.createdAt)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = d.getDate().toString()
        if (!map[key]) map[key] = []
        map[key].push(post)
      }
    }
    return map
  }, [posts, year, month])

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  const selectedPosts = selected ? (postsByDay[selected] ?? []) : []

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <h1 className="font-[family-name:var(--font-poppins)] font-bold text-2xl text-gray-900 mb-6">
        Content Calendar
      </h1>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h2 className="font-[family-name:var(--font-poppins)] font-semibold text-sm text-gray-900">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square border-b border-r border-gray-100 last:border-r-0" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const key = day.toString()
            const dayPosts = postsByDay[key] ?? []
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            const isSelected = selected === key

            return (
              <button
                key={day}
                onClick={() => setSelected(isSelected ? null : key)}
                className={`aspect-square border-b border-r border-gray-100 p-1.5 flex flex-col items-start transition-colors hover:bg-gray-50 ${isSelected ? 'bg-indigo-50' : ''} ${(day + firstDay) % 7 === 0 ? 'border-r-0' : ''}`}
              >
                <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>
                  {day}
                </span>
                {dayPosts.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {dayPosts.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className={`w-1.5 h-1.5 rounded-full ${p.status === 'APPROVED' ? 'bg-green-500' : 'bg-amber-400'}`}
                      />
                    ))}
                    {dayPosts.length > 3 && <span className="text-[9px] text-gray-400">+{dayPosts.length - 3}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day posts */}
      {selected && (
        <div className="mt-6 space-y-3">
          <h3 className="font-[family-name:var(--font-poppins)] font-semibold text-sm text-gray-900">
            {MONTH_NAMES[month]} {selected}, {year} — {selectedPosts.length} post{selectedPosts.length !== 1 ? 's' : ''}
          </h3>
          {selectedPosts.length === 0 && (
            <p className="text-sm text-gray-400">No posts on this day.</p>
          )}
          {selectedPosts.map((post) => (
            <div key={post.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {post.newsletter}
                </span>
                <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${post.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {post.status === 'APPROVED'
                    ? <CheckCircle className="w-3 h-3" />
                    : <FileText className="w-3 h-3" />}
                  {post.status}
                </span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-dm-sans)] line-clamp-4">
                {post.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
