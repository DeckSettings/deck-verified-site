export const getPCGamingWikiUrlFromGameName = (gameName: string) => {
  const encodedGameName = encodeURIComponent(
    gameName
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/ /g, '_')
      .trim()
  )
  return `https://www.pcgamingwiki.com/wiki/${encodedGameName}`
}
