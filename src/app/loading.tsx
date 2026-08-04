export default function Loading() {
  return (
    <main className="app-shell" aria-busy="true" aria-label="在庫を読み込んでいます">
      <section className="inventory-app loading-view">
        <header className="app-header">
          <div>
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-note" />
          </div>
          <div className="skeleton skeleton-button" />
        </header>
        <div className="loading-content">
          <div className="skeleton skeleton-tabs" />
          <div className="skeleton skeleton-heading" />
          <div className="loading-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        </div>
      </section>
    </main>
  );
}
