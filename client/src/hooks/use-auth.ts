import { create } from 'zustand';

interface User {
  username: string;
  email: string;
  isAnonymous?: boolean;
}

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  setAnonymousUser: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  setAnonymousUser: () => set({ 
    user: { 
      username: 'Anonymous',
      email: 'anonymous@user',
      isAnonymous: true 
    } 
  }),
}));