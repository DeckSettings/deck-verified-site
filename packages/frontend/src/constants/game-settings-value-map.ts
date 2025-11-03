export const gameSettingsValueMap: string[][] = [
  ['enabled', 'enable', 'on', '1'],
  ['disabled', 'disable', 'off', '0'],
]

export const isSameValue = (val1: string, val2: string): boolean => {
  if (typeof val1 !== 'string' || typeof val2 !== 'string') {
    return val1 === val2
  }

  const v1 = val1.toLowerCase()
  const v2 = val2.toLowerCase()

  if (v1 === v2) {
    return true
  }

  for (const group of gameSettingsValueMap) {
    const lowerCaseGroup = group.map(v => v.toLowerCase())
    if (lowerCaseGroup.includes(v1) && lowerCaseGroup.includes(v2)) {
      return true
    }
  }

  return false
}
