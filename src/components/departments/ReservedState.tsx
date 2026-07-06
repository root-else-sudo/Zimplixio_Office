export default function ReservedState({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="soft-card px-10 py-12 text-center max-w-md">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mb-4"
          style={{ background: 'var(--copper-500)' }}
        />
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--gray-900)' }}>
          {name}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--gray-600)' }}>
          Reserved — not yet built.
        </p>
      </div>
    </div>
  )
}
