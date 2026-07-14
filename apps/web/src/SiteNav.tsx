export function SiteNav({ current }: { current: "home" | "backtest" }) {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <a className={`site-nav__brand ${current === "home" ? "active" : ""}`} href="/">
        Cursor Trade
      </a>
      <div className="site-nav__links">
        <a className={current === "home" ? "active" : ""} href="/" aria-current={current === "home" ? "page" : undefined}>
          Markets
        </a>
        <a className={current === "backtest" ? "active" : ""} href="/backtest" aria-current={current === "backtest" ? "page" : undefined}>
          Backtest
        </a>
      </div>
    </nav>
  );
}
