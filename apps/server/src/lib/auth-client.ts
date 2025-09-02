import { createAuthClient } from "better-auth/react";

/**
 * Authentication client implementation using Better Auth
 *
 * Creates a configured authentication client for handling user authentication
 * operations including sign-in, sign-out, sign-up, and session management.
 *
 * @returns {AuthClient} The configured Better Auth client instance
 */
export const authClient = createAuthClient();

/**
 * Destructured authentication methods and hooks from the auth client
 *
 * Exports commonly used authentication functions and React hooks for
 * convenient access throughout the application.
 *
 * - signIn: Function to authenticate users
 * - signOut: Function to log out users
 * - signUp: Function to register new users
 * - useSession: React hook for accessing current session state
 */
export const { signIn, signOut, signUp, useSession } = authClient;
