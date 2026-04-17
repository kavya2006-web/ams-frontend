"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter, usePathname } from 'next/navigation';
import { IncompleteProfileResponse, User } from "./types/UserTypes";

type AuthContextType = {
  session: unknown;
  user: User | null;
  incompleteProfile: IncompleteProfileResponse | null;
  isLoading: boolean;
  error: string | null;
  refetchUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const hasSession = Boolean(session);
  const [user, setUser] = useState<User | null>(null);
  const [incompleteProfile, setIncompleteProfile] = useState<IncompleteProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchTsRef = useRef(0);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUser = useCallback(async () => {
    if (inFlightRef.current) return;

    // Avoid rapid duplicate calls on onboarding route when backend keeps returning 422.
    const now = Date.now();
    if (pathname === '/onboarding' && now - lastFetchTsRef.current < 800) {
      return;
    }

    inFlightRef.current = true;
    lastFetchTsRef.current = now;

    if (!session) {
      setUser(null);
      setIncompleteProfile(null);
      setIsLoading(false);
      
      // Redirect to signin if unauthenticated (except on public pages)
      const publicPaths = ['/', '/signin', '/signup'];
      if (!publicPaths.includes(pathname)) {
        router.push('/signin');
      }
      inFlightRef.current = false;
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });


      const responseData = await response.json();
      const userData = responseData?.data as User | undefined;

      if (!userData) {
        throw new Error('Invalid user response');
      }

      if (response.status === 422) {
        setIncompleteProfile(userData as IncompleteProfileResponse);
      } else {
        setIncompleteProfile(null);
      }

      setUser(userData);

      if (response.status === 422) {
        // User needs onboarding; avoid self-redirect loops.
        setIsLoading(false);
        if (pathname !== '/onboarding') {
          router.replace('/onboarding');
        }
        return;
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching user:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch user data');
      setIsLoading(false);
      setUser(null);
      setIncompleteProfile(null);
    } finally {
      inFlightRef.current = false;
    }
  }, [pathname, router, session]);

  useEffect(() => {
    if (!isPending) {
      fetchUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, hasSession, fetchUser]);

  const value: AuthContextType = {
    session,
    user,
    incompleteProfile,
    isLoading: isPending || isLoading,
    error,
    refetchUser: fetchUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
