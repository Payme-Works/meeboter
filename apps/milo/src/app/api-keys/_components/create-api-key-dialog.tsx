"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { CreateApiKeyForm } from "./create-api-key-form";

export function CreateApiKeyDialog() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" />
					Generate API Key
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create API Key</DialogTitle>
				</DialogHeader>
				<CreateApiKeyForm onSuccess={() => setIsOpen(false)} />
			</DialogContent>
		</Dialog>
	);
}
