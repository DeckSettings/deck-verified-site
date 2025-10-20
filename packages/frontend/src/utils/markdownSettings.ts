export interface MarkdownSettingEntry {
  key: string;
  rawKey: string;
  value: string;
}

/**
 * Parse markdown formatted as "- **Key:** Value" into key/value pairs.
 */
export function parseMarkdownKeyValueList(markdown: string | null | undefined): MarkdownSettingEntry[] {
  if (!markdown) return []

  const regex = /^-\s\*\*(.+?):\*\*\s*(.+)$/i
  const lines = markdown.split('\n')
  const entries: MarkdownSettingEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(regex)
    if (!match || match.length < 3) continue

    const rawKey = (match[1] ?? '').trim()
    const value = (match[2] ?? '').trim()
    if (!rawKey || !value) continue

    entries.push({
      key: rawKey.toUpperCase(),
      rawKey,
      value,
    })
  }

  return entries
}
