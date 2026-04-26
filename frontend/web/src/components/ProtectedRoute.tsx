import type React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export interface ProtectedRouteProps {
  roles: string[]
  children: React.ReactNode
}

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const role = useAuthStore((s) => s.role)
  if (!role) return <Navigate to="/login" replace />
  if (!roles.includes(role)) return <Navigate to="/" replace />
  return <>{children}</>
}
