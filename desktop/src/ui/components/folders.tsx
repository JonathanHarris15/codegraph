// codegraph: component folders
import { ChevronRight, Folder, FolderPlus, MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { SketchFolder } from '../../features/list-folders.js'
import { Button, Field, Sheet } from '../design-system/kit.js'
import { CanvasMenu, type MenuItem } from './canvas-menu.js'

/** What is carried when a sketch or a folder is dragged onto a folder. */
const SKETCH = 'application/x-codegraph-sketch'
const FOLDER = 'application/x-codegraph-folder'

/** Lets a row be dragged into a folder. */
export const dragSketch = (sketchId: string) => ({
  draggable: true,
  onDragStart: (event: DragEvent) => {
    event.dataTransfer.setData(SKETCH, sketchId)
    event.dataTransfer.effectAllowed = 'move'
  },
})

/** A library's folders, read again whenever something changes online. */
export const useFolders = (library: string) => {
  const [folders, setFolders] = useState<SketchFolder[]>([])
  const load = useCallback(async (): Promise<void> => {
    setFolders(library ? await window.codegraph.listFolders(library) : [])
  }, [library])
  useEffect(() => {
    void load()
    return window.codegraph.heardChange(() => void load())
  }, [load])
  return { folders, reload: load }
}

/** Which folder a sketch shows in: one that is gone means the top. */
export const shownIn = (folderId: string | undefined, folders: SketchFolder[]): string =>
  folderId && folders.some((f) => f.id === folderId) ? folderId : ''

/** The folders from the top down to this one. */
const pathTo = (at: string, folders: SketchFolder[]): SketchFolder[] => {
  const out: SketchFolder[] = []
  for (let id = at; id; ) {
    const one = folders.find((f) => f.id === id)
    if (!one || out.includes(one)) break
    out.unshift(one)
    id = one.parentId
  }
  return out
}

/** A place a sketch or folder can be dropped into. */
const useDrop = (onDrop: (what: { sketch?: string; folder?: string }) => void) => {
  const [over, setOver] = useState(false)
  return {
    over,
    on: {
      onDragOver: (event: DragEvent) => {
        if (!event.dataTransfer.types.includes(SKETCH) && !event.dataTransfer.types.includes(FOLDER)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        setOver(false)
        const sketch = event.dataTransfer.getData(SKETCH)
        const folder = event.dataTransfer.getData(FOLDER)
        onDrop(sketch ? { sketch } : folder ? { folder } : {})
      },
    },
  }
}

const Crumb = ({ name, current, onGo, onDrop }: { name: string; current: boolean; onGo: () => void; onDrop: (what: { sketch?: string; folder?: string }) => void }) => {
  const drop = useDrop(onDrop)
  return (
    <button type="button" className={`folder-crumb${drop.over ? ' folder-crumb--over' : ''}`} aria-current={current ? 'location' : undefined} onClick={onGo} {...drop.on}>
      {name}
    </button>
  )
}

const FolderRow = ({
  folder,
  count,
  canEdit,
  onGo,
  onDrop,
  menu,
}: {
  folder: SketchFolder
  count: number
  canEdit: boolean
  onGo: () => void
  onDrop: (what: { sketch?: string; folder?: string }) => void
  menu: MenuItem[]
}) => {
  const drop = useDrop(onDrop)
  const more = useRef<HTMLButtonElement>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <li
      className={`folder-row${drop.over ? ' folder-row--over' : ''}`}
      {...(canEdit
        ? {
            draggable: true,
            onDragStart: (event: DragEvent) => {
              event.dataTransfer.setData(FOLDER, folder.id)
              event.dataTransfer.effectAllowed = 'move'
            },
          }
        : {})}
      {...drop.on}
    >
      <button type="button" className="folder-row-open" onClick={onGo} aria-label={`Open folder ${folder.name}`}>
        <Folder size={16} aria-hidden="true" />
        <span className="folder-row-name">{folder.name}</span>
        <span className="ds-hint">{count === 0 ? 'Empty' : count === 1 ? '1 thing' : `${count} things`}</span>
      </button>
      {canEdit ? (
        <button
          ref={more}
          type="button"
          className="folder-row-more"
          aria-label={`More for folder ${folder.name}`}
          aria-expanded={menuAt !== null}
          onClick={() => {
            if (menuAt) return setMenuAt(null)
            const at = more.current?.getBoundingClientRect()
            const box = more.current?.closest('li')?.getBoundingClientRect()
            if (at && box) setMenuAt({ x: at.right - box.left - 180, y: at.bottom - box.top + 4 })
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      ) : null}
      {menuAt ? <CanvasMenu at={menuAt} items={menu} opener={more} onClose={() => setMenuAt(null)} /> : null}
    </li>
  )
}

/** Asks for a folder's name, to make one or to rename it. */
export const FolderNameSheet = ({ title, start, action, onSave, onClose }: { title: string; start: string; action: string; onSave: (name: string) => Promise<string>; onClose: () => void }) => {
  const [name, setName] = useState(start)
  const [problem, setProblem] = useState('')
  const save = async (): Promise<void> => {
    if (!name.trim()) return
    const said = await onSave(name)
    if (said) setProblem(said)
    else onClose()
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <Field label="Folder name" value={name} focus onChange={setName} onEnter={() => void save()} />
      {problem ? (
        <div className="ds-hint" role="alert">
          {problem}
        </div>
      ) : null}
      <div className="ds-sheet-actions">
        <Button look="bare" onClick={onClose}>
          Cancel
        </Button>
        <Button look="loud" disabled={!name.trim()} onClick={() => void save()}>
          {action}
        </Button>
      </div>
    </Sheet>
  )
}

/** Picks a folder to move something into: the top, or any folder, but never the
 *  folder being moved or one inside it. */
export const FolderPickSheet = ({
  title,
  folders,
  moving = '',
  current,
  onPick,
  onClose,
}: {
  title: string
  folders: SketchFolder[]
  /** A folder being moved, which cannot go inside itself. */
  moving?: string
  current: string
  onPick: (folderId: string) => void
  onClose: () => void
}) => {
  const inside = (id: string): boolean => pathTo(id, folders).some((f) => f.id === moving)
  const rows: { folder: SketchFolder; depth: number }[] = []
  const walk = (parent: string, depth: number): void => {
    for (const folder of folders.filter((f) => f.parentId === parent)) {
      if (moving && inside(folder.id)) continue
      rows.push({ folder, depth })
      walk(folder.id, depth + 1)
    }
  }
  walk('', 0)
  return (
    <Sheet title={title} onClose={onClose}>
      <ul className="folder-pick">
        <li>
          <button type="button" className="folder-pick-row" disabled={current === ''} onClick={() => onPick('')}>
            All sketches{current === '' ? ' · here now' : ''}
          </button>
        </li>
        {rows.map(({ folder, depth }) => (
          <li key={folder.id}>
            <button type="button" className="folder-pick-row" style={{ paddingLeft: 12 + (depth + 1) * 16 }} disabled={current === folder.id} onClick={() => onPick(folder.id)}>
              <Folder size={14} aria-hidden="true" /> {folder.name}
              {current === folder.id ? ' · here now' : ''}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/** The folders of a sketch library around whatever lists its sketches: where
 *  you are, the way back up, the folders here, and the sketches here. Sketches
 *  and folders can be dragged onto a folder, or onto a step of the way back. */
export const FolderBrowser = ({
  library,
  folders,
  reload,
  at,
  onGo,
  canEdit,
  sketchFolders,
  onFiled,
  children,
}: {
  library: string
  folders: SketchFolder[]
  reload: () => Promise<void>
  /** The folder being looked in; '' for the top. */
  at: string
  onGo: (folderId: string) => void
  canEdit: boolean
  /** Which folder each sketch is in, to count what each folder holds. */
  sketchFolders: Record<string, string>
  /** After a sketch is filed, so the list can read it again. */
  onFiled: () => void
  /** The sketches in this folder, as the list draws them. */
  children: ReactNode
}) => {
  const [naming, setNaming] = useState<{ folder?: SketchFolder } | null>(null)
  const [moving, setMoving] = useState<SketchFolder | null>(null)
  const [problem, setProblem] = useState('')
  const here = folders.filter((f) => f.parentId === at)
  const path = pathTo(at, folders)
  const count = (id: string): number => folders.filter((f) => f.parentId === id).length + Object.values(sketchFolders).filter((f) => f === id).length

  const said = (done: { ok: boolean; problem?: string }): boolean => {
    setProblem(done.ok ? '' : (done.problem ?? ''))
    return done.ok
  }
  const dropInto = (folderId: string) => async (what: { sketch?: string; folder?: string }): Promise<void> => {
    if (!canEdit) return
    if (what.sketch) {
      if (said(await window.codegraph.fileSketch(library, what.sketch, folderId))) onFiled()
    } else if (what.folder && what.folder !== folderId) {
      if (said(await window.codegraph.moveFolder(library, what.folder, folderId))) await reload()
    }
  }
  const remove = async (folder: SketchFolder): Promise<void> => {
    if (said(await window.codegraph.deleteFolder(library, folder.id))) {
      await reload()
      onFiled()
    }
  }

  return (
    <div className="folder-browser">
      <div className="folder-bar">
        <nav className="folder-crumbs" aria-label="Where you are in the folders">
          <Crumb name="All sketches" current={at === ''} onGo={() => onGo('')} onDrop={(what) => void dropInto('')(what)} />
          {path.map((folder) => (
            <span key={folder.id} className="folder-crumb-step">
              <ChevronRight size={13} aria-hidden="true" />
              <Crumb name={folder.name} current={folder.id === at} onGo={() => onGo(folder.id)} onDrop={(what) => void dropInto(folder.id)(what)} />
            </span>
          ))}
        </nav>
        {canEdit ? (
          <Button look="bare" onClick={() => setNaming({})} label="New folder">
            <FolderPlus size={15} aria-hidden="true" /> New folder
          </Button>
        ) : null}
      </div>
      {problem ? (
        <div className="ds-hint" role="alert">
          {problem}
        </div>
      ) : null}
      {here.length ? (
        <ul className="folder-list" aria-label="Folders">
          {here.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              count={count(folder.id)}
              canEdit={canEdit}
              onGo={() => onGo(folder.id)}
              onDrop={(what) => void dropInto(folder.id)(what)}
              menu={[
                { name: 'Rename', act: () => setNaming({ folder }) },
                { name: 'Move to…', act: () => setMoving(folder) },
                'rule',
                { name: 'Delete folder', danger: true, act: () => void remove(folder) },
              ]}
            />
          ))}
        </ul>
      ) : null}
      {children}
      {at && !here.length && !Object.values(sketchFolders).includes(at) ? <div className="ds-empty">This folder is empty. Drag sketches here, or use a sketch’s “Move to folder…”.</div> : null}

      {naming ? (
        <FolderNameSheet
          title={naming.folder ? `Rename ${naming.folder.name}` : 'New folder'}
          start={naming.folder?.name ?? ''}
          action={naming.folder ? 'Rename' : 'Make it'}
          onSave={async (name) => {
            const done = naming.folder ? await window.codegraph.renameFolder(library, naming.folder.id, name) : await window.codegraph.makeFolder(library, name, at)
            if (done.ok) await reload()
            return done.ok ? '' : (done.problem ?? 'That did not work.')
          }}
          onClose={() => setNaming(null)}
        />
      ) : null}
      {moving ? (
        <FolderPickSheet
          title={`Move ${moving.name} to…`}
          folders={folders}
          moving={moving.id}
          current={moving.parentId}
          onPick={(parentId) =>
            void window.codegraph.moveFolder(library, moving.id, parentId).then(async (done) => {
              if (said(done)) await reload()
              setMoving(null)
            })
          }
          onClose={() => setMoving(null)}
        />
      ) : null}
    </div>
  )
}
