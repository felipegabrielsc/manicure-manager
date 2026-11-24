import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startTour(steps, labels = {}) {
  return driver({
    showProgress: true,
    nextBtnText: labels.nextBtnText || 'Próximo',
    prevBtnText: labels.prevBtnText || 'Anterior',
    doneBtnText: labels.doneBtnText || 'Entendi!',
    steps,
  }).drive()
}
