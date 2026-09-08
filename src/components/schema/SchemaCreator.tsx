import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import type { FieldDef, FieldType, SchemaDef } from '#/types'

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

  if (!isOpen) return null

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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      className="schema-modal-backdrop"
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div
        className="schema-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schema-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="schema-modal-header">
            <h2 id="schema-modal-title" className="schema-modal-title">
              {isEditing ? `Edit Type: ${schema?.name}` : 'New Object Type'}
            </h2>
            <button
              type="button"
              className="schema-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="schema-modal-body">
            {error && <div className="schema-error-banner">{error}</div>}

            <div className="schema-form-field">
              <label htmlFor="schema-type-name" className="schema-label">
                Type Name
              </label>
              <input
                ref={nameInputRef}
                id="schema-type-name"
                type="text"
                className="schema-input"
                placeholder="e.g. Task, Person, Project, Bug"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="schema-fields-section">
              <div className="schema-fields-header">
                <span className="schema-label">Fields ({fields.length})</span>
                <button
                  type="button"
                  className="schema-add-field-btn"
                  onClick={handleAddField}
                >
                  + Add field
                </button>
              </div>

              <div className="schema-fields-list">
                {fields.map((field, idx) => (
                  <div key={field.id} className="schema-field-row">
                    <div className="schema-reorder-buttons">
                      <button
                        type="button"
                        className="schema-reorder-btn"
                        disabled={idx === 0}
                        onClick={() => handleMoveField(idx, 'up')}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="schema-reorder-btn"
                        disabled={idx === fields.length - 1}
                        onClick={() => handleMoveField(idx, 'down')}
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    <input
                      type="text"
                      className="schema-field-input"
                      placeholder="Field name"
                      value={field.name}
                      onChange={(e) =>
                        handleUpdateField(field.id, { name: e.target.value })
                      }
                    />

                    <select
                      className="schema-field-select"
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
                    </select>

                    <button
                      type="button"
                      className="schema-remove-field-btn"
                      onClick={() => handleRemoveField(field.id)}
                      title="Remove field"
                      aria-label={`Remove field ${field.name || 'unnamed'}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="schema-modal-footer">
            <button
              type="button"
              className="schema-btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="schema-btn-submit">
              {isEditing ? 'Save Changes' : 'Create Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
