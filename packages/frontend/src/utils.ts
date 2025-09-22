/**
 * Normalises colour + opacity combinations to consistent CSS strings.
 *
 * HomePageSection needs identical gradient definitions during SSR and on the
 * client. Returning the same `color-mix` / `rgba` string regardless of runtime
 * environment avoids hydration mismatches while still supporting palette vars,
 * hex, and rgba inputs.
 */
export function resolveCssColor(colour: string, opacity: number): string {
  const clampedOpacity = Math.min(Math.max(opacity, 0), 1)

  if (/^#([0-9a-f]{3}){1,2}$/i.test(colour)) {
    const hex = colour.replace('#', '')
    const expanded = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex
    const r = parseInt(expanded.substring(0, 2), 16)
    const g = parseInt(expanded.substring(2, 4), 16)
    const b = parseInt(expanded.substring(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`
  }

  if (/^rgba?\(/i.test(colour)) {
    const values = colour
      .replace(/rgba?\(/i, '')
      .replace(')', '')
      .split(',')
      .map(part => part.trim())

    const [r = '0', g = '0', b = '0'] = values
    return `rgba(${r}, ${g}, ${b}, ${clampedOpacity})`
  }

  if (/^var\(/i.test(colour)) {
    return `color-mix(in srgb, ${colour} ${clampedOpacity * 100}%, transparent)`
  }

  return `color-mix(in srgb, ${colour} ${clampedOpacity * 100}%, transparent)`
}
