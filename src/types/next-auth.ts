import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      isGuest?: boolean
      guestExpiresAt?: string
    }
  }

  interface User {
    isGuest?: boolean
    guestLastActiveAt?: Date | null
  }
}

export {}
