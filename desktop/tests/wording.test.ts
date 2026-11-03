// codegraph: test module wording
import { describe, expect, it } from 'vitest'
import { sentenceOf, spoken, verbOf, type Said } from '../src/modules/wording/index.js'

const plain = (said: Said): string => said.map((part) => part.text).join('')

describe('a wire read as a sentence', () => {
  it('names who acts, how, on what, and what for', () => {
    expect(plain(sentenceOf('write-note', 'uses', 'notes', 'saves the note'))).toBe('write-note uses notes to save the note')
    expect(plain(sentenceOf('join', 'asks', 'sign-up', 'signs a new person up'))).toBe('join asks sign-up to sign a new person up')
    expect(plain(sentenceOf('notes', 'reads', 'session', 'makes sure someone is logged in'))).toBe(
      'notes reads session to make sure someone is logged in',
    )
    expect(plain(sentenceOf('nightly-tidy', 'starts', 'write-note', 'clears out empty notes'))).toBe(
      'nightly-tidy starts write-note to clear out empty notes',
    )
    expect(plain(sentenceOf('notes', 'calls', 'mailer', 'tells the owner'))).toBe('notes calls mailer to tell the owner')
  })

  it('says what is kept, and where', () => {
    expect(plain(sentenceOf('users', 'keeps', 'db', 'keeps passwords'))).toBe('users keeps passwords in db')
    expect(plain(sentenceOf('notes', 'keeps', 'db', ''))).toBe('notes keeps its data in db')
  })

  it('reads a page leading to another without words', () => {
    expect(plain(sentenceOf('home', 'leads to', 'login', ''))).toBe('home leads to login')
  })

  it('stops after the object when the code gave no words', () => {
    expect(plain(sentenceOf('join', 'asks', 'sign-up', ''))).toBe('join asks sign-up')
  })

  it('keeps words that do not start with a verb as they are, after a dash', () => {
    expect(plain(sentenceOf('join', 'asks', 'sign-up', 'for a new account'))).toBe('join asks sign-up — for a new account')
  })

  it('marks who acts and what is acted on, so they can stand out', () => {
    const said = sentenceOf('write-note', 'uses', 'notes', 'saves the note')
    expect(said.filter((part) => part.role === 'name').map((part) => part.text)).toEqual(['write-note', 'notes'])
    expect(said.find((part) => part.role === 'verb')?.text).toBe('uses')
  })

  it('reads the older names for the kinds the way the new ones read', () => {
    expect(verbOf('acts on')).toBe('asks')
    expect(verbOf('shows')).toBe('reads')
    expect(plain(sentenceOf('join', 'acts on', 'sign-up', 'signs a new person up'))).toBe(
      'join asks sign-up to sign a new person up',
    )
  })
})

describe('turning the words in the code into what follows "to"', () => {
  it('takes the verb back to its plain form', () => {
    expect(spoken('saves the note')).toBe('save the note')
    expect(spoken('lists the notes')).toBe('list the notes')
    expect(spoken('finds notes by their words')).toBe('find notes by their words')
    expect(spoken('checks the email and where to go next')).toBe('check the email and where to go next')
    expect(spoken('watches the folder')).toBe('watch the folder')
    expect(spoken('carries the order')).toBe('carry the order')
    expect(spoken('goes home')).toBe('go home')
    expect(spoken('has the key')).toBe('have the key')
    expect(spoken('is ready')).toBe('be ready')
  })

  it('turns both verbs when two are joined', () => {
    expect(spoken('reads and writes people and passwords')).toBe('read and write people and passwords')
  })

  it('leaves words alone that do not start with such a verb', () => {
    expect(spoken('for a new account')).toBe('')
    expect(spoken('')).toBe('')
  })
})
