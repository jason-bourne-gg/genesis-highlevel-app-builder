import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateDoc = vi.fn()

vi.mock('@/lib/firebase', () => ({ functionsBase: 'https://f.test', auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), setDoc: vi.fn(), collection: () => ({}), doc: (_c: unknown, id: string) => ({ id }),
  getDoc: vi.fn(), onSnapshot: () => () => {}, orderBy: vi.fn(), query: vi.fn(),
  updateDoc, where: vi.fn(), writeBatch: vi.fn(),
}))

const { fileId, sortFiles, updateProject, deleteProject } = await import('@/services/projects')

beforeEach(() => updateDoc.mockClear())

describe('updateProject', () => {
  it('writes the name and description and touches updatedAt', async () => {
    await updateProject('p1', { name: 'Recall Chaser', description: 'texts patients' })
    const [, fields] = updateDoc.mock.calls[0]
    expect(fields.name).toBe('Recall Chaser')
    expect(fields.description).toBe('texts patients')
    expect(fields.updatedAt).toBeGreaterThan(0)
  })

  // The rules pin ownerUid on update, so including it would fail the write outright.
  it('never sends ownerUid or locationId', async () => {
    await updateProject('p1', { name: 'n', description: 'd' })
    const [, fields] = updateDoc.mock.calls[0]
    expect(Object.keys(fields).sort()).toEqual(['description', 'name', 'updatedAt'])
  })
})

describe('deleteProject', () => {
  // Soft delete: a hard one would have to walk every subcollection.
  it('sets deletedAt rather than removing anything', async () => {
    await deleteProject('p1')
    const [, fields] = updateDoc.mock.calls[0]
    expect(Object.keys(fields)).toEqual(['deletedAt'])
    expect(fields.deletedAt).toBeGreaterThan(0)
  })
})

describe('fileId', () => {
  // Must match fileId() in functions/src/generate/store.ts: the generation function and the
  // browser both derive the document id from the path, and a file has to land in the same
  it('leaves the four real paths untouched', () => {
    for (const p of ['index.html', 'app.js', 'styles.css', 'hl.js']) {
      expect(fileId(p)).toBe(p)
    }
  })

  it('never produces a separator, which Firestore ids cannot contain', () => {
    expect(fileId('src/app.js')).not.toContain('/')
    expect(fileId('../secrets')).not.toContain('/')
  })

  it('replaces every character outside the allowed set', () => {
    expect(fileId('a b?c#d.js')).toBe('a_b_c_d.js')
  })
})

describe('sortFiles', () => {
  // Firestore has no inherent order, so the file tree's order is imposed here — and it
  // is the order the files are written in, which is what makes streaming legible.
  it('puts the four known files in their written order', () => {
    const shuffled = ['hl.js', 'styles.css', 'index.html', 'app.js'].map((path) => ({
      path,
      content: '',
    }))
    expect(sortFiles(shuffled).map((f) => f.path)).toEqual([
      'index.html',
      'app.js',
      'styles.css',
      'hl.js',
    ])
  })

  it('puts anything unrecognised last, in alphabetical order', () => {
    const files = ['zeta.txt', 'app.js', 'alpha.txt'].map((path) => ({ path, content: '' }))
    expect(sortFiles(files).map((f) => f.path)).toEqual(['app.js', 'alpha.txt', 'zeta.txt'])
  })

  it('does not mutate the array it was given', () => {
    const files = [
      { path: 'hl.js', content: '' },
      { path: 'index.html', content: '' },
    ]
    sortFiles(files)
    expect(files.map((f) => f.path)).toEqual(['hl.js', 'index.html'])
  })

  it('handles an empty list', () => {
    expect(sortFiles([])).toEqual([])
  })
})
