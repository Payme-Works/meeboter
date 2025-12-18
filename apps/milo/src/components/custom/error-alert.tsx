import { Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ErrorAlertProps {
	errorMessage: string;
}

export default function ErrorAlert({ errorMessage }: ErrorAlertProps) {
	return (
		<Alert data-testid="error-alert" className="w-full">
			<Terminal className="h-4 w-4" />

			<AlertTitle>An error occurred</AlertTitle>
			<AlertDescription>{errorMessage}</AlertDescription>
		</Alert>
	);
}
