import { test, expect } from 'vitest'
import { PathTracker } from './stack.js'

test('PathControl', () => {
  const stack = new PathTracker()

  expect(stack.isEmpty()).toBe(true)
  let releaseA = stack.enter('user')
  let releaseB = stack.enter('address')
  let releaseC = stack.enter('street')
  expect(stack.isEmpty()).toBe(false)

  expect(stack.toString()).toBe('user.address.street')
  releaseC()
  releaseC()
  expect(stack.toString()).toBe('user.address')
  releaseB()
  expect(stack.toString()).toBe('user')
  releaseA()
  expect(stack.toString()).toBe('')

  releaseA = stack.enter('user')
  releaseB = stack.enter('address')
  releaseC = stack.enter('street')
  expect(stack.toString()).toBe('user.address.street')

  // Эмулируем ошибку не позволяющую вызвать releaseC()
  const processError = () => {
    throw new Error('process error')
    // @ts-ignore
    releaseC()
  }
  expect(() => processError()).toThrow('process error')
  releaseB()
  expect(stack.toString()).toBe('user')

  releaseA()
  expect(stack.toString()).toBe('')
  releaseA()
  expect(stack.toString()).toBe('')
  expect(stack.isEmpty()).toBe(true)
})
