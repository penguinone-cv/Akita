"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="app-shell">
      <section className="inventory-app fatal-error" role="alert">
        <div className="state-icon" aria-hidden="true">
          !
        </div>
        <h1>画面を表示できませんでした</h1>
        <p>一時的な問題が発生しました。少し待ってから、もう一度お試しください。</p>
        <button className="button button-primary" type="button" onClick={reset}>
          もう一度試す
        </button>
      </section>
    </main>
  );
}
