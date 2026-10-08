"use client"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-5 text-center"><span className="flex size-14 items-center justify-center rounded-full bg-[#e9eee8] text-primary">!</span><h1 className="mt-5 font-serif text-3xl">Đã có lỗi xảy ra</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Trang chưa thể tải lúc này. Bạn có thể thử lại ngay.</p><button onClick={reset} className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Thử lại</button></main>
}
