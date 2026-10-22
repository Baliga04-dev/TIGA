import { describe, expect, it } from 'vitest'
import { parseWake } from './wake'

describe('parseWake', () => {
  it.each([
    ['Hey Tiga, what is on my screen', 'what is on my screen'],
    ['hey tiger who is waiting on me', 'who is waiting on me'],
    ['OK Tiga play lo-fi music', 'play lo-fi music'],
    ['so anyway hey Tega. good morning', 'good morning'],
    ['Hey Tiga', ''],
    ['hey tiga.', ''],
  ])('hears the wake phrase in %j', (heard, command) => {
    expect(parseWake(heard)).toEqual({ wake: true, command })
  })

  it.each(['tiger balm is on the shelf', 'hey there', 'Antigua is lovely', 'they tiga'])('ignores %j', (heard) => {
    expect(parseWake(heard).wake).toBe(false)
  })
})
