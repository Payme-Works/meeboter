"use client";

import Image from "next/image";
import { QueryClient, QueryClientProvider } from "react-query";
import AppSection from "./components/AppSection";
import { Button } from "./components/button";
import MeetingBotCreator from "./components/MeetingBotCreator";
import RecordingPlayer from "./components/RecordingPlayer";

const queryClient = new QueryClient();

export default function Home() {
	return (
		<QueryClientProvider client={queryClient}>
			{/* Simple Header */}
			<div className="flex items-center gap-4 p-4">
				<Image
					src="/logo.svg"
					alt="Logo"
					width={48}
					height={48}
					className="mr-2"
				/>
				<h1 className="text-center text-3xl font-bold">Live Boost</h1>
				<h1
					className="text-muted-foreground text-2xl"
					style={{ translate: "0px 2px" }}
				>
					Example Application
				</h1>
				<div className="ml-auto">
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							window.open("https://github.com/live-boost/live-boost")
						}
					>
						GitHub
					</Button>
				</div>
			</div>

			<div className="p-8">
				<AppSection
					header={"Enter Meeting Link"}
					description={
						"Enter a meeting link for a Meet, Teams or Zoom Meeting."
					}
				>
					<MeetingBotCreator />
				</AppSection>

				{/* Recording */}
				<AppSection
					header={"Recording Replay"}
					description={
						"Once the meeting is finished, the recording will play below along with an AI-generated transcript and summary."
					}
				>
					<RecordingPlayer />
				</AppSection>
			</div>
		</QueryClientProvider>
	);
}
