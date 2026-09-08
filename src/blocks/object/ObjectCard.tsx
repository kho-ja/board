import type { ObjectBlockData, SchemaDef } from '#/types'

interface ObjectCardProps {
  data: ObjectBlockData
  schema?: SchemaDef | null
}

export function ObjectCard({ data, schema }: ObjectCardProps) {
  const typeName = schema?.name ?? data.schemaId ?? data.kind

  const fields = schema?.fields ?? []
  const titleField = fields.find((f) =>
    ['title', 'name', 'label'].includes(f.name.toLowerCase()),
  )
  const titleVal = titleField
    ? data.values[titleField.id] ?? data.values[titleField.name]
    : undefined

  const fallbackTextVal = fields
    .filter((f) => f.fieldType === 'text')
    .map((f) => data.values[f.id] ?? data.values[f.name])
    .find((v) => typeof v === 'string' && v.trim())

  const displayTitle =
    (typeof titleVal === 'string' && titleVal.trim()) ||
    (typeof fallbackTextVal === 'string' && fallbackTextVal.trim()) ||
    `New ${typeName}`

  // Display other fields (up to 4 in card preview)
  const displayFields = fields.filter((f) => f.id !== titleField?.id).slice(0, 4)

  return (
    <div className="object-card">
      <div className="object-card-header">
        <span className="object-card-badge">{typeName}</span>
      </div>
      <h3 className="object-card-title">{displayTitle}</h3>
      {displayFields.length > 0 && (
        <div className="object-card-fields">
          {displayFields.map((field) => {
            const rawVal = data.values[field.id] ?? data.values[field.name]
            return (
              <div key={field.id} className="object-card-field-row">
                <span className="object-card-field-label">{field.name}</span>
                <span className="object-card-field-val">
                  {renderFieldValue(rawVal, field.fieldType)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function renderFieldValue(val: unknown, type: string) {
  if (val === undefined || val === null || val === '') {
    return <span className="object-field-empty">—</span>
  }
  if (type === 'boolean') {
    return (
      <span className={`object-bool-pill${val ? ' is-true' : ' is-false'}`}>
        {val ? 'Yes' : 'No'}
      </span>
    )
  }
  if (type === 'date' && typeof val === 'string') {
    try {
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      }
    } catch {
      // fallback
    }
  }
  return String(val)
}
