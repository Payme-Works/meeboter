/**
 * This file is used to mock the better-auth client used by front-end code to get the user's session.
 */

const useSession = jest.fn();

const signIn = {
	social: jest.fn(),
};

const signOut = jest.fn();

export { useSession, signIn, signOut };
