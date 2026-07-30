'use client'
import { create } from 'zustand'

export interface AppUser {
  id: string
  phone: string
  name: string
  nickname: string | null
  avatar: string | null
  stage: string
  grade: string
}

interface AppState {
  user: AppUser | null
  currentView: string
  setUser: (u: AppUser | null) => void
  setView: (v: string) => void
  logout: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  currentView: 'dashboard',
  setUser: (u) => set({ user: u }),
  setView: (v) => set({ currentView: v }),
  logout: () => {
    fetch('/api/auth', { method: 'DELETE' })
    set({ user: null, currentView: 'dashboard' })
  },
}))
