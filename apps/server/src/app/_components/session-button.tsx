"use client";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SessionButton() {
	const { data: session } = useSession();

	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("");
	};

	if (!session?.user) {
		return (
			<Button 
				variant="outline" 
				className="gap-2"
				onClick={() => signIn.social({ provider: "github" })}
			>
				Sign In
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" className="gap-2">
					<Avatar className="h-6 w-6">
						<AvatarImage src="https://github.com/shadcn.png" />
						<AvatarFallback>
							{getInitials(session.user.name ?? "")}
						</AvatarFallback>
					</Avatar>
					{session.user.name}
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent>
				<DropdownMenuLabel>My Account</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem 
					className="cursor-pointer"
					onClick={() => signOut()}
				>
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
