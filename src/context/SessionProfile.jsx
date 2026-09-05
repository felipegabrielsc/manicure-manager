import { createContext, useContext } from 'react'

export const SessionProfileContext = createContext({
  profile: null,
  refreshProfile: async () => {},
})

export function useSessionProfile() {
  return useContext(SessionProfileContext)
}
