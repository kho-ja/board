import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'

import { db } from '#/db/index'
import { blocks } from '#/db/schema'
import type { TextBlockData } from '#/types'

const getBlocks = createServerFn({
  method: 'GET',
}).handler(async () => {
  return await db.query.blocks.findMany({
    orderBy: [desc(blocks.createdAt)],
  })
})

const createTextBlock = createServerFn({
  method: 'POST',
})
  .validator((input: { markdown: string }) => input)
  .handler(async ({ data }) => {
    const blockData: TextBlockData = { kind: 'text', markdown: data.markdown }
    return await db
      .insert(blocks)
      .values({ id: crypto.randomUUID(), kind: 'text', data: blockData })
      .returning()
  })

export const Route = createFileRoute('/demo/drizzle')({
  component: DemoDrizzle,
  loader: async () => await getBlocks(),
})

function DemoDrizzle() {
  const router = useRouter()
  const allBlocks = Route.useLoaderData()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    const markdown = formData.get('markdown') as string

    if (!markdown) return

    try {
      await createTextBlock({ data: { markdown } })
      router.invalidate()
      ;(e.target as HTMLFormElement).reset()
    } catch (error) {
      console.error('Failed to create block:', error)
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-2xl">
        <header className="mb-8 flex items-center gap-4">
          <span className="demo-card flex h-14 w-14 items-center justify-center p-3">
            <img src="/drizzle.svg" alt="Drizzle Logo" className="h-8 w-8" />
          </span>
          <div>
            <p className="island-kicker mb-2">Database</p>
            <h1 className="demo-title">Drizzle Demo — Blocks</h1>
          </div>
        </header>

        <h2 className="demo-section-title mb-4">Blocks</h2>

        <ul className="space-y-3 mb-6">
          {allBlocks.map((block) => (
            <li key={block.id} className="demo-list-item">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {block.kind === 'text'
                    ? ((block.data as TextBlockData).markdown ?? '')
                    : block.kind}
                </span>
                <span className="demo-muted text-xs">{block.kind}</span>
              </div>
            </li>
          ))}
          {allBlocks.length === 0 && (
            <li className="demo-list-item text-center demo-muted">
              No blocks yet. Create one below!
            </li>
          )}
        </ul>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            name="markdown"
            placeholder="Add a new text block..."
            className="demo-input min-w-0 flex-1"
          />
          <button type="submit" className="demo-button whitespace-nowrap">
            Add Block
          </button>
        </form>
      </section>
    </main>
  )
}