export function currentTime(): number {
  return Date.now()
}

export function fmtTime(ms: number): string {
  const date = new Date(ms)
  return date.toLocaleTimeString()
}

export function fmtDateTime(ms: number): string {
  const date = new Date(ms)
  return date.toLocaleString()
}

export function fmtAgo(ms: number): string {
  const ago = Date.now() - ms
  const mins = Math.floor(ago / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
}

export function downloadFile(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
