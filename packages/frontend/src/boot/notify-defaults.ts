import { Notify, Platform } from 'quasar'

const defaults: Parameters<typeof Notify.setDefaults>[0] = {
  position: Platform.is.mobile ? 'top-left' : 'bottom',
}

if (Platform.is.mobile) {
  defaults.classes = 'notify-mobile-offset'
}

Notify.setDefaults(defaults)
