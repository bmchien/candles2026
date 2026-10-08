export default function Loading() {
  return <main className="mx-auto min-h-[50vh] max-w-6xl px-5 py-12" aria-label="Đang tải cửa hàng"><div className="h-8 w-52 animate-pulse rounded-lg bg-muted" /><div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="animate-pulse"><div className="aspect-[.88] rounded-2xl bg-muted" /><div className="mt-3 h-3 w-2/3 rounded bg-muted" /><div className="mt-2 h-3 w-1/2 rounded bg-muted" /></div>)}</div></main>
}
