"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { isApiError, loadStoredToken, onUnauthorized, setAccessToken } from "@/lib/api/client"
import { authService } from "@/services/auth.service"
import type { AuthResult, User } from "@/types/commerce"

export type SessionStatus = "loading" | "authenticated" | "guest"

/**
 * Authentication state backed by the real backend JWT.
 * The token is restored on load and validated with GET /users/me; any later 401 on an
 * authenticated request (expired / revoked token) ends the session via `onExpired`.
 */
export function useSession(onExpired: () => void) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<SessionStatus>("loading")
  // Settles with the restored user once the initial token check is done, so actions
  // triggered while the page is still loading (e.g. "add to cart") are not lost.
  const restored = useRef<{ promise: Promise<User | null>; resolve: (user: User | null) => void } | null>(null)
  if (!restored.current) {
    let resolve: (user: User | null) => void = () => undefined
    const promise = new Promise<User | null>((r) => { resolve = r })
    restored.current = { promise, resolve }
  }

  useEffect(() => {
    const done = (me: User | null) => {
      setUser(me)
      setStatus(me ? "authenticated" : "guest")
      restored.current?.resolve(me)
    }
    if (!loadStoredToken()) {
      done(null)
      return
    }
    let cancelled = false
    authService.me()
      .then((me) => { if (!cancelled) done(me) })
      .catch((error: unknown) => {
        if (cancelled) return
        if (isApiError(error, 401)) setAccessToken(null)
        done(null)
      })
    return () => { cancelled = true }
  }, [])

  /** The current user, waiting for the initial session check if it is still running. */
  const resolveUser = useCallback(async () => (status === "loading" ? restored.current!.promise : user), [status, user])

  useEffect(() => {
    onUnauthorized(() => {
      setAccessToken(null)
      setUser(null)
      setStatus("guest")
      onExpired()
    })
    return () => onUnauthorized(null)
  }, [onExpired])

  const signIn = useCallback((result: AuthResult, remember = true) => {
    setAccessToken(result.access_token, remember)
    setUser(result.user)
    setStatus("authenticated")
  }, [])

  const signOut = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus("guest")
  }, [])

  return { user, status, signIn, signOut, resolveUser }
}
