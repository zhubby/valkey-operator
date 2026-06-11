import { AlertCircle } from "lucide-react"

export function EmptyState({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed bg-background p-8 text-center">
      <AlertCircle className="mb-3 size-6 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {detail ? (
        <div className="mt-1 max-w-md text-sm text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  )
}
