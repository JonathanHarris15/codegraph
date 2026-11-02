// codegraph: design system
import type { ReactNode } from 'react'
import './theme.css'

type Tone = 'plain' | 'good' | 'warn' | 'bad'

export const Badge = ({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={tone === 'plain' ? 'ds-badge' : `ds-badge ds-badge--${tone}`}>{children}</span>
)

export const Button = ({
  look = 'normal',
  onClick,
  disabled,
  title,
  children,
}: {
  look?: 'normal' | 'loud' | 'bare'
  onClick?: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) => (
  <button
    type="button"
    className={look === 'normal' ? 'ds-button' : `ds-button ds-button--${look}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {children}
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
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onEnter?: () => void
  password?: boolean
}) => (
  <label className="ds-field">
    <span className="ds-label">{label}</span>
    <input
      className="ds-input"
      type={password ? 'password' : 'text'}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) onEnter()
      }}
    />
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
