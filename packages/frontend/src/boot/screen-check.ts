import { boot } from 'quasar/wrappers'
import { Screen } from 'quasar'

declare module 'quasar' {
  interface Screen {
    isShortLandscape: boolean
  }
}

const defineIsShortLandscape = (screenObject: Screen) => {
  Object.defineProperty(screenObject, 'isShortLandscape', {
    configurable: true,
    enumerable: true,
    get: () => screenObject.height < 800 && screenObject.width > 600 && screenObject.width > screenObject.height,
  })
}

export default boot(({ app }) => {
  defineIsShortLandscape(Screen)

  const q = app.config.globalProperties?.$q
  if (q?.screen) {
    defineIsShortLandscape(q.screen as Screen)
  }
})
