"use client";

import { Github } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signIn, signUp } from "@/lib/auth-client";

export default function SignUpPage() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const router = useRouter();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			setIsLoading(false);

			return;
		}

		if (password.length < 6) {
			setError("Password must be at least 6 characters long");
			setIsLoading(false);

			return;
		}

		try {
			const result = await signUp.email({
				email,
				password,
				name,
			});

			if (result.error) {
				setError(result.error.message || "Sign up failed");
			} else {
				router.push("/");
			}
		} catch (err) {
			setError("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleGithubSignIn = async () => {
		await signIn.social({ provider: "github" });
	};

	return (
		<div className="flex flex-1 items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl">Sign Up</CardTitle>

					<CardDescription>Create a new account to get started</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								type="text"
								placeholder="Enter your name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="Enter your email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="Enter your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirmPassword">Confirm Password</Label>
							<Input
								id="confirmPassword"
								type="password"
								placeholder="Confirm your password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								required
							/>
						</div>
						{error && (
							<div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
								{error}
							</div>
						)}
						<Button type="submit" className="w-full" disabled={isLoading}>
							{isLoading ? "Creating account..." : "Sign Up"}
						</Button>
					</form>

					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<Separator className="w-full" />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-white px-2 text-muted-foreground">
								Or continue with
							</span>
						</div>
					</div>

					<Button
						variant="outline"
						className="w-full"
						onClick={handleGithubSignIn}
					>
						<Github className="mr-2 h-4 w-4" />
						GitHub
					</Button>
				</CardContent>
				<CardFooter className="text-center">
					<p className="text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link href="/auth/sign-in" className="text-primary hover:underline">
							Sign in
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
