import { AlertTriangle } from "lucide-react"

import { OperatorApiError } from "@/lib/api"

export function ErrorBanner({ error }: { error: unknown }) {
  const message =
    error instanceof OperatorApiError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : "Request failed"

  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
