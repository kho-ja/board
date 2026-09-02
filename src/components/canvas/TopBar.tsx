import ThemeToggle from '#/components/ThemeToggle'

export function TopBar() {
  return (
    <header className="board-topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-copy">
          <p className="brand-name">Kho-ja</p>
          <p className="brand-file">Board</p>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="topbar-hint">V · Move  H · Hand  T · Text</span>
        <ThemeToggle className="theme-toggle" />
      </div>
    </header>
  )
}