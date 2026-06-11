"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Boxes, Database, Gauge, Settings2 } from "lucide-react"

import { cn } from "@/lib/utils"

const navItems = [
  { href: "/clusters", label: "Clusters", icon: Database },
  { href: "/clusters/new", label: "Create", icon: Boxes },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen w-screen max-w-[100vw] overflow-x-hidden bg-background text-foreground lg:w-full lg:max-w-full">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r bg-sidebar lg:block">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gauge className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Valkey Operator</div>
            <div className="text-xs text-muted-foreground">Management console</div>
          </div>
        </div>
        <nav className="p-2">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href === "/clusters" && pathname.startsWith("/clusters/"))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/25",
                  active && "bg-sidebar-accent font-medium"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute right-0 bottom-0 left-0 border-t p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Settings2 className="size-3.5" />
            API via /operator-api
          </div>
        </div>
      </aside>
      <div className="w-screen max-w-[100vw] min-w-0 lg:w-full lg:max-w-full lg:pl-60">
        <header className="sticky top-0 z-10 box-border flex h-14 w-screen max-w-[100vw] items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:w-full lg:max-w-full lg:px-6">
          <Link href="/clusters" className="flex items-center gap-2 lg:hidden">
            <Gauge className="size-5 text-primary" />
            <span className="text-sm font-semibold">Valkey Operator</span>
          </Link>
          <div className="hidden text-sm text-muted-foreground lg:block">
            Kubernetes custom resources for Valkey clusters
          </div>
          <div className="rounded-md border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            v1alpha1
          </div>
        </header>
        <main className="mx-auto box-border w-screen max-w-[100vw] min-w-0 overflow-x-hidden px-4 py-5 lg:w-full lg:max-w-7xl lg:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
