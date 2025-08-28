import type { DefaultSession, Session, User } from "next-auth";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { Provider } from "next-auth/providers/index";
import { cache } from "react";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
	interface Session extends DefaultSession {
		user: {
			id: string;
		} & DefaultSession["user"];
	}
}

export const { auth: uncachedAuth, handlers } = NextAuth({
	providers: [GitHub as unknown as Provider],

	session: {
		strategy: "database",
	},

	callbacks: {
		session: ({ session, user }: { session: Session; user: User }) => ({
			...session,
			user: {
				...session.user,
				id: user.id,
			},
		}),
	},
});

export const auth = cache(uncachedAuth);
