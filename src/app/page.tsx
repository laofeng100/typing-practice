'use client'

import { useEffect, useState } from 'react'
import LoginScreen from '@/components/app/login-screen'
import AppShell from '@/components/app/app-shell'
import { Skeleton } from '@/components/ui/skeleton'

export default function Home() {
  const [user, setUser] = useState<any | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) setUser(d.user)
        setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [])

  const handleLoggedIn = (u: any) => setUser(u)
  const handleLogout = () => setUser(null)

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-4 p-6">
          <Skeleton className="h-10 w-2/3 mx-auto" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  if (!user) return <LoginScreen onLoggedIn={handleLoggedIn} />
  return <AppShell user={user} onLogout={handleLogout} />
}
