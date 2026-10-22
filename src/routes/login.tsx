import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { loginFn, registerFn } from '#/lib/auth/auth.functions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Sign in / sign up.
 *
 * One page with two modes: the fields are nearly the same and a separate
 * "sign up" route would only add a second URL to keep in sync.
 */

type Mode = 'signin' | 'signup'

export const Route = createFileRoute('/login')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result =
        mode === 'signin'
          ? await loginFn({ data: { email, password } })
          : await registerFn({ data: { email, password, name } })

      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.')
        return
      }
      await navigate({ to: search.redirect ?? '/boards' })
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="brand-mark mx-auto mb-4 block" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Kho-ja Board
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'signin'
              ? 'Sign in to open your boards.'
              : 'Create an account to start a board.'}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(['signin', 'signup'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value)
                  setError(null)
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {value === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <div className="mb-4 space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                autoComplete="name"
              />
            </div>
          )}

          <div className="mb-4 space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="mb-4 space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Your boards and their contents are private to you and the people you
          share them with.
        </p>
      </div>
    </main>
  )
}
