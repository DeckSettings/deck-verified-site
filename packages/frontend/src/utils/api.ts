export const apiUrl = (path: string) => {
  const backendApiOrigin = process.env.BACKEND_API_ORIGIN || 'https://deckverified.games'
  const isSsrBuild = globalThis.isSsr ?? typeof window === 'undefined'
  const isNativeBuild = globalThis.isMobile ?? false
  if (isSsrBuild || isNativeBuild) {
    return `${backendApiOrigin}${path}`
  }
  return path
}
