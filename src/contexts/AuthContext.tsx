import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { usersDB } from '../lib/db';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const storedUserId = localStorage.getItem('hueveria_logged_in_user');
      if (storedUserId) {
        const u = await usersDB.getById(storedUserId);
        if (u) setUser(u);
      }
    })();
  }, []);

  const login = (u: User) => {
    setUser(u);
    localStorage.setItem('hueveria_logged_in_user', u.id);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('hueveria_logged_in_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
