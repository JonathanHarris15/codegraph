// codegraph: test module dev-server
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { answers, isOnThisComputer } from '../src/modules/dev-server/index.js'

/** A real server on this computer stands in for a repo's dev server: it is
 *  outside the program, the way a person's own `npm run dev` is. */
let server: Server
let address = ''

beforeAll(async () => {
  server = createServer((_, res) => {
    res.statusCode = 404
    res.end('not here')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((done) => server.close(() => done())))

describe('a dev server on this computer', () => {
  it('answers when it is running, whatever it says back', async () => {
    expect(await answers(address)).toBe(true)
  })

  it('does not when nothing is listening there', async () => {
    const closed = createServer()
    await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
    const port = (closed.address() as AddressInfo).port
    await new Promise<void>((done) => closed.close(() => done()))
    expect(await answers(`http://127.0.0.1:${port}`)).toBe(false)
  })

  it('is only ever one on this computer', async () => {
    expect(isOnThisComputer('http://localhost:5173')).toBe(true)
    expect(isOnThisComputer('http://127.0.0.1:3000/')).toBe(true)
    expect(isOnThisComputer('https://localhost')).toBe(true)
    expect(isOnThisComputer('http://example.com:5173')).toBe(false)
    expect(isOnThisComputer('http://localhost.example.com')).toBe(false)
    expect(isOnThisComputer('file:///etc/passwd')).toBe(false)
    expect(isOnThisComputer('not an address')).toBe(false)
    expect(await answers('http://example.com')).toBe(false)
  })
})
