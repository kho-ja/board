export type Vec = { x: number; y: number }

export type BlockKind =
  | 'file'
  | 'file-group'
  | 'text'
  | (string & {})

export interface FileBlockData {
  kind: 'file'
  name: string
  size: number
  mimeType: string
}

export interface FileGroupBlockData {
  kind: 'file-group'
  name: string
  currentView: 'card' | 'list'
}

export interface TextBlockData {
  kind: 'text'
  markdown: string
}

export type FieldValue = string | number | boolean | null

export interface ObjectBlockData {
  kind: string
  schemaId: string
  values: Record<string, FieldValue>
}

export type BlockData =
  | FileBlockData
  | FileGroupBlockData
  | TextBlockData
  | ObjectBlockData

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'relation'

export interface FieldDef {
  id: string
  name: string
  fieldType: FieldType
}

export interface SchemaDef {
  id: string
  name: string
  fields: FieldDef[]
  defaultView?: string | null
}

export type ViewLayout = 'card' | 'list' | 'grid'

export interface ViewOptions {
  fields?: string[]
  layout: ViewLayout
  sort?: { field: string; dir: 'asc' | 'desc' }
  density?: string
}

export interface ViewDef {
  id: string
  name: string
  targetKind: string
  options: ViewOptions
}
