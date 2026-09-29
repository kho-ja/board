import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type { FieldDef, FieldType, SchemaDef } from '#/types'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'

interface SchemaCreatorProps {
  isOpen: boolean
  schema?: SchemaDef | null
  onClose: () => void
  onSave: (schema: SchemaDef) => void
}

const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'boolean', label: 'Boolean (Yes/No)' },
  { type: 'date', label: 'Date' },
]

export function SchemaCreator({
  isOpen,
  schema,
  onClose,
  onSave,
}: SchemaCreatorProps) {
  const isEditing = Boolean(schema)
  const [name, setName] = useState('')
  const [fields, setFields] = useState<FieldDef[]>([])
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (schema) {
        setName(schema.name)
        setFields(
          schema.fields.map((f) => ({
            id: f.id,
            name: f.name,
            fieldType: f.fieldType,
          })),
        )
      } else {
        setName('')
        setFields([
          { id: crypto.randomUUID(), name: 'Title', fieldType: 'text' },
        ])
      }
      setError(null)
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [isOpen, schema])

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', fieldType: 'text' },
    ])
  }

  const handleRemoveField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  const handleUpdateField = (
    id: string,
    patch: Partial<Omit<FieldDef, 'id'>>,
  ) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    )
  }

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    setFields((prev) => {
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(nextIndex, 0, item)
      return copy
    })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Please provide a type name.')
      return
    }

    const validFields = fields.filter((f) => f.name.trim().length > 0)
    if (validFields.length === 0) {
      setError('Please add at least one field with a name.')
      return
    }

    const savedSchema: SchemaDef = {
      id: schema?.id ?? crypto.randomUUID(),
      name: trimmedName,
      fields: validFields.map((f) => ({
        id: f.id,
        name: f.name.trim(),
        fieldType: f.fieldType,
      })),
      defaultView: schema?.defaultView,
    }

    onSave(savedSchema)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit Type: ${schema?.name}` : 'New Object Type'}
          </DialogTitle>
          <DialogDescription>
            Define the fields for this object type. Each block will use these fields.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="flex w-full flex-col gap-2">
            <label htmlFor="schema-type-name" className="text-sm font-medium">
              Type Name
            </label>
            <Input
              ref={nameInputRef}
              id="schema-type-name"
              type="text"
              placeholder="e.g. Task, Person, Project, Bug"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <Separator />

          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium">Fields ({fields.length})</span>
              <Button type="button" variant="outline" size="sm" onClick={handleAddField}>
                + Add field
              </Button>
            </div>

            <div className="flex w-full flex-col gap-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex w-full items-center gap-1.5">
                  <div className="inline-flex flex-col items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={idx === 0}
                      onClick={() => handleMoveField(idx, 'up')}
                      title="Move up"
                      aria-label={`Move field ${field.name || 'unnamed'} up`}
                    >
                      <span aria-hidden="true">▲</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={idx === fields.length - 1}
                      onClick={() => handleMoveField(idx, 'down')}
                      title="Move down"
                      aria-label={`Move field ${field.name || 'unnamed'} down`}
                    >
                      <span aria-hidden="true">▼</span>
                    </Button>
                  </div>

                  <Input
                    type="text"
                    className="min-w-0 flex-1"
                    placeholder="Field name"
                    value={field.name}
                    onChange={(e) =>
                      handleUpdateField(field.id, { name: e.target.value })
                    }
                  />

                  <NativeSelect
                    className="w-40 shrink-0"
                    value={field.fieldType}
                    onChange={(e) =>
                      handleUpdateField(field.id, {
                        fieldType: e.target.value as FieldType,
                      })
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>

                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleRemoveField(field.id)}
                    title="Remove field"
                    aria-label={`Remove field ${field.name || 'unnamed'}`}
                  >
                    <span aria-hidden="true">×</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter showCloseButton={false}>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? 'Save Changes' : 'Create Type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}