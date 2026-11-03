// codegraph: design system
import { Moon, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import './theme.css'

/** A state a badge can carry. Every one of them shows a word too, so none of
 *  them leans on its colour. `warn` and `bad` are the old names for `waiting`
 *  and `problem`. */
type Tone = 'plain' | 'good' | 'waiting' | 'problem' | 'warn' | 'bad'

const toneNow: Record<Tone, string> = {
  plain: 'plain',
  good: 'good',
  waiting: 'waiting',
  problem: 'problem',
  warn: 'waiting',
  bad: 'problem',
}

export const Badge = ({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) => {
  const now = toneNow[tone]
  return <span className={now === 'plain' ? 'ds-badge' : `ds-badge ds-badge--${now}`}>{children}</span>
}

export const Button = ({
  look = 'normal',
  onClick,
  disabled,
  title,
  label,
  children,
}: {
  look?: 'normal' | 'loud' | 'bare'
  onClick?: () => void
  disabled?: boolean
  title?: string
  label?: string
  children: ReactNode
}) => (
  <button
    type="button"
    className={look === 'normal' ? 'ds-button' : `ds-button ds-button--${look}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={label}
  >
    {children}
  </button>
)

/** A tool in the rail: a glyph with its name under it, never a bare icon. */
export const Tool = ({
  name,
  on,
  hint,
  more = false,
  disabled = false,
  onPick,
  children,
}: {
  name: string
  on: boolean
  hint?: string
  more?: boolean
  disabled?: boolean
  onPick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    className={on ? 'ds-tool ds-tool--on' : 'ds-tool'}
    aria-pressed={on}
    title={hint}
    disabled={disabled}
    onClick={onPick}
  >
    {children}
    <span>{name}</span>
    {more ? <span className="ds-tool-more" aria-hidden="true">›</span> : null}
  </button>
)

export const Card = ({
  quiet = false,
  children,
}: {
  quiet?: boolean
  children: ReactNode
}) => <div className={quiet ? 'ds-card ds-card--quiet' : 'ds-card'}>{children}</div>

export const Field = ({
  label,
  value,
  placeholder,
  onChange,
  onEnter,
  password = false,
  focus = false,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onEnter?: () => void
  password?: boolean
  focus?: boolean
}) => (
  <label className="ds-field">
    <span className="ds-label">{label}</span>
    <input
      className="ds-input"
      type={password ? 'password' : 'text'}
      value={value}
      autoFocus={focus}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) onEnter()
      }}
    />
  </label>
)

/** A short, flat list of words to pick from. Where the list groups, or a row
 *  needs a second line, use a button and a panel instead. */
export const Select = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) => (
  <label className="ds-field">
    <span className="ds-label">{label}</span>
    <select
      className="ds-input"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
)

export const Sheet = ({ children }: { children: ReactNode }) => (
  <div className="ds-veil">
    <div className="ds-sheet">{children}</div>
  </div>
)

export const Rows = ({ children }: { children: ReactNode }) => (
  <div className="ds-rows">{children}</div>
)

export const Row = ({ children }: { children: ReactNode }) => <div className="ds-row">{children}</div>

const THEME_KEY = 'codegraph-theme'

/** The theme this computer last picked, put on the page before anything draws,
 *  so the window never flashes the other one. Light unless dark was picked. */
export const wearTheme = (): 'light' | 'dark' => {
  let picked: string | null = null
  try {
    picked = window.localStorage.getItem(THEME_KEY)
  } catch {
    picked = null
  }
  const theme = picked === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset['theme'] = theme
  return theme
}

/** Switches between the light and the dark theme, and remembers the pick. */
export const ThemeSwitch = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light',
  )
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="ds-button ds-button--bare ds-button--icon"
      aria-label={`Switch to the ${next} theme`}
      title={`Switch to the ${next} theme`}
      onClick={() => {
        document.documentElement.dataset['theme'] = next
        try {
          window.localStorage.setItem(THEME_KEY, next)
        } catch {
          // A theme that is not remembered is still worn for now.
        }
        setTheme(next)
      }}
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}
