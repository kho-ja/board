import { useCallback, useMemo } from 'react'

import type {
  FieldValue,
  ObjectBlockData,
  SchemaDef,
} from '#/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

interface ObjectEditPanelProps {
  blockId: string
  data: ObjectBlockData
  schema?: SchemaDef | null
  onUpdateValues: (blockId: string, values: Record<string, FieldValue>) => void
  onEditSchema?: (schema: SchemaDef) => void
}

export function ObjectEditPanel({
  blockId,
  data,
  schema,
  onUpdateValues,
  onEditSchema,
}: ObjectEditPanelProps) {
  const fields = useMemo(() => schema?.fields ?? [], [schema?.fields])
  const values = useMemo(() => data.values ?? {}, [data.values])

  const handleFieldChange = useCallback(
    (fieldId: string, value: FieldValue) => {
      const nextValues = { ...values, [fieldId]: value }
      onUpdateValues(blockId, nextValues)
    },
    [blockId, values, onUpdateValues],
  )

  // Identify values that don't match any active field id or name (preserved data per never-destroy rule)
  const activeFieldKeys = useMemo(
    () => new Set([
      ...fields.map((f) => f.id),
      ...fields.map((f) => f.name),
    ]),
    [fields],
  )
  const archivedEntries = useMemo(
    () => Object.entries(values).filter(([k]) => !activeFieldKeys.has(k)),
    [values, activeFieldKeys],
  )

  return (
    <div className="object-edit-panel">
      <div className="object-panel-header">
        <span className="object-type-badge">{schema?.name ?? data.kind}</span>
        {schema && onEditSchema && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="inspector-btn object-edit-schema-btn"
            onClick={() => onEditSchema(schema)}
          >
            Edit schema
          </Button>
        )}
      </div>

      <div className="object-fields-list">
        {fields.map((field) => {
          const rawVal = values[field.id] ?? values[field.name]

          return (
            <div key={field.id} className="inspector-field">
              <div className="object-field-header">
                <label
                  className="inspector-label"
                  htmlFor={`obj-field-${blockId}-${field.id}`}
                >
                  {field.name}
                </label>
                <span className="object-field-type">{field.fieldType}</span>
              </div>

              {field.fieldType === 'text' && (
                <Input
                  id={`obj-field-${blockId}-${field.id}`}
                  type="text"
                  className="inspector-input"
                  value={typeof rawVal === 'string' ? rawVal : ''}
                  placeholder={`Enter ${field.name.toLowerCase()}...`}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                />
              )}

              {field.fieldType === 'number' && (
                <Input
                  id={`obj-field-${blockId}-${field.id}`}
                  type="number"
                  className="inspector-input"
                  value={
                    typeof rawVal === 'number'
                      ? rawVal
                      : rawVal !== null && rawVal !== undefined
                        ? String(rawVal)
                        : ''
                  }
                  placeholder="0"
                  onChange={(e) => {
                    const v = e.target.value
                    handleFieldChange(field.id, v === '' ? null : Number(v))
                  }}
                />
              )}

              {field.fieldType === 'boolean' && (
                <div className="object-checkbox-field">
                  <Checkbox
                    id={`obj-field-${blockId}-${field.id}`}
                    checked={!!rawVal}
                    onCheckedChange={(checked) =>
                      handleFieldChange(field.id, !!checked)
                    }
                  />
                  <label
                    className="object-checkbox-label"
                    htmlFor={`obj-field-${blockId}-${field.id}`}
                  >
                    <span>
                      {rawVal ? 'Enabled / True' : 'Disabled / False'}
                    </span>
                  </label>
                </div>
              )}

              {field.fieldType === 'date' && (
                <Input
                  id={`obj-field-${blockId}-${field.id}`}
                  type="date"
                  className="inspector-input"
                  value={typeof rawVal === 'string' ? rawVal : ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                />
              )}
            </div>
          )
        })}

        {fields.length === 0 && (
          <p className="inspector-hint">
            This type has no fields. Click &ldquo;Edit schema&rdquo; to add fields.
          </p>
        )}

        {/* Never-destroy rule: preserved values for removed fields */}
        {archivedEntries.length > 0 && (
          <div className="object-archived-section">
            <h4 className="object-archived-title">Preserved Values</h4>
            {archivedEntries.map(([key, val]) => (
              <div key={key} className="object-archived-row">
                <span className="object-archived-key">{key}:</span>
                <span className="object-archived-val">{String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
