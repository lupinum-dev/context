const PREFIXES_KEY = 'lupinumContext.promptPrefixes'
const ACTIVE_PREFIX_KEY = 'lupinumContext.activePromptPrefixId'
const INLINE_PREFIX_KEY = 'lupinumContext.inlinePrefixText'
const IMPORT_KEY = 'lupinumContext.promptPrefixImportComplete'
const OLD_PREFIX_HISTORY_KEY = 'promptTower.prefixHistory'

export interface AppStorage {
  get<T>(key: string, fallback: T): T
  update(key: string, value: unknown): Thenable<void> | Promise<void>
}

export interface PromptPrefix {
  id: string
  name: string
  text: string
  createdAt: string
  updatedAt: string
}

export class PromptPrefixes {
  constructor(
    private globalStorage: AppStorage,
    private workspaceStorage: AppStorage,
  ) {}

  async importOldPrefixesOnce(): Promise<void> {
    if (this.globalStorage.get<boolean>(IMPORT_KEY, false)) {
      return
    }

    const oldHistory = this.globalStorage.get<Array<{ text?: string }>>(OLD_PREFIX_HISTORY_KEY, [])
    const existingTexts = new Set(this.listPrefixes().map((prefix) => prefix.text))
    const importedTexts: string[] = []
    for (const entry of oldHistory) {
      const text = entry.text?.trim() ?? ''
      if (text.length === 0 || existingTexts.has(text) || importedTexts.includes(text)) {
        continue
      }
      importedTexts.push(text)
    }
    const imported = importedTexts.map((text, index) =>
      createPromptPrefix(`Imported Prefix ${index + 1}`, text),
    )

    await this.saveAll([...this.listPrefixes(), ...imported])
    await this.globalStorage.update(IMPORT_KEY, true)
  }

  listPrefixes(): PromptPrefix[] {
    return parsePromptPrefixes(this.globalStorage.get<unknown>(PREFIXES_KEY, []))
  }

  getActivePrefixId(): string | null {
    return this.workspaceStorage.get<string | null>(ACTIVE_PREFIX_KEY, null)
  }

  async setActivePrefix(prefixId: string | null): Promise<void> {
    await this.workspaceStorage.update(ACTIVE_PREFIX_KEY, prefixId)
  }

  getInlinePrefix(): string {
    return this.workspaceStorage.get<string>(INLINE_PREFIX_KEY, '')
  }

  async setInlinePrefix(text: string): Promise<void> {
    await this.workspaceStorage.update(INLINE_PREFIX_KEY, text)
  }

  getEffectivePrefix(): string {
    return this.getActivePrefix()?.text ?? this.getInlinePrefix()
  }

  getActivePrefix(): PromptPrefix | null {
    const id = this.getActivePrefixId()
    return id ? (this.listPrefixes().find((prefix) => prefix.id === id) ?? null) : null
  }

  async createPrefix(name: string, text: string): Promise<PromptPrefix> {
    const prefix = createPromptPrefix(name, text)
    await this.upsert(prefix)
    await this.setActivePrefix(prefix.id)
    return prefix
  }

  async updatePrefix(prefixId: string, update: { name?: string; text?: string }): Promise<void> {
    const prefix = this.requirePrefix(prefixId)
    await this.upsert({
      ...prefix,
      name: update.name === undefined ? prefix.name : normalizePrefixName(update.name),
      text: update.text === undefined ? prefix.text : update.text,
      updatedAt: new Date().toISOString(),
    })
  }

  async duplicatePrefix(prefixId: string): Promise<PromptPrefix> {
    const prefix = this.requirePrefix(prefixId)
    const duplicate = createPromptPrefix(`${prefix.name} Copy`, prefix.text)
    await this.upsert(duplicate)
    await this.setActivePrefix(duplicate.id)
    return duplicate
  }

  async deletePrefix(prefixId: string): Promise<void> {
    await this.saveAll(this.listPrefixes().filter((prefix) => prefix.id !== prefixId))
    if (this.getActivePrefixId() === prefixId) {
      await this.setActivePrefix(null)
    }
  }

  private async upsert(prefix: PromptPrefix): Promise<void> {
    const prefixes = this.listPrefixes()
    const index = prefixes.findIndex((candidate) => candidate.id === prefix.id)
    if (index >= 0) {
      prefixes[index] = prefix
    } else {
      prefixes.push(prefix)
    }
    await this.saveAll(prefixes)
  }

  private async saveAll(prefixes: readonly PromptPrefix[]): Promise<void> {
    await this.globalStorage.update(PREFIXES_KEY, prefixes)
  }

  private requirePrefix(prefixId: string): PromptPrefix {
    const prefix = this.listPrefixes().find((candidate) => candidate.id === prefixId)
    if (!prefix) {
      throw new Error('Prompt prefix not found.')
    }
    return prefix
  }
}

export function createPromptPrefix(
  name: string,
  text: string,
  now: string = new Date().toISOString(),
  id: string = createId(),
): PromptPrefix {
  return {
    id,
    name: normalizePrefixName(name),
    text,
    createdAt: now,
    updatedAt: now,
  }
}

export function parsePromptPrefixes(value: unknown): PromptPrefix[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isPromptPrefix)
}

function normalizePrefixName(name: string): string {
  const trimmed = name.trim()
  return trimmed || 'Untitled Prefix'
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isPromptPrefix(value: unknown): value is PromptPrefix {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prefix = value as PromptPrefix
  return (
    Object.keys(prefix).every((key) =>
      ['id', 'name', 'text', 'createdAt', 'updatedAt'].includes(key),
    ) &&
    typeof prefix.id === 'string' &&
    typeof prefix.name === 'string' &&
    typeof prefix.text === 'string' &&
    typeof prefix.createdAt === 'string' &&
    typeof prefix.updatedAt === 'string'
  )
}
