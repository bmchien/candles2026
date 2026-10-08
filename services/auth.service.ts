import { api } from "@/lib/api/client"
import type { AuthResult, User } from "@/types/commerce"

export const authService = {
  login: (email: string, password: string) => api.post<AuthResult>("/auth/login", { email, password }),
  register: (name: string, email: string, password: string) => api.post<AuthResult>("/auth/register", { name, email, password }),
  /** Validates the stored token and returns the current user (role changes apply immediately). */
  me: () => api.get<User>("/users/me"),
}
