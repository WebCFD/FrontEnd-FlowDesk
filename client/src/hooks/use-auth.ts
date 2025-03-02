import { create } from 'zustand';

interface User {
  username: string;
  email: string;
  isAnonymous?: boolean;
}

interface AuthState {
  user: User | null;
  returnTo: string | null;
  setUser: (user: User | null) => void;
  setAnonymousUser: () => void;
  setReturnTo: (path: string | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  returnTo: null,
  setUser: (user) => set({ user }),
  setAnonymousUser: () => set({ 
    user: { 
      username: 'Anonymous',
      email: 'anonymous@user',
      isAnonymous: true 
    } 
  }),
  setReturnTo: (path) => set({ returnTo: path }),
}));