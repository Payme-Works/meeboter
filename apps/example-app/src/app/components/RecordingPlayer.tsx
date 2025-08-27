"use client";

import { useState } from "react";
import ReactPlayer from "react-player";
import { Button } from "./button";
import TranscriptSummary from "./TranscriptSummary";

export default function RecordingPlayer() {
	const [recordingLink, setRecordingLink] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const fetchRecording = async () => {
		try {
			setLoading(true);
			const response = await fetch("/api/callback");
			const data = await response.json();
			if (data.link) {
				setRecordingLink(data.link);
			}
		} catch (error) {
			console.error("Error fetching recording:", error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="mx-auto w-full max-w-3xl">
				{recordingLink ? (
					<>
						<ReactPlayer
							url={recordingLink}
							controls
							width="100%"
							height="auto"
							className="mb-2"
						/>
						<div className="text-muted-foreground mb-6 text-sm">
							<a
								href={recordingLink}
								target="_blank"
								rel="noopener noreferrer"
								className="hover:underline"
							>
								Open recording in new tab
							</a>
						</div>
					</>
				) : (
					<div className="text-muted-foreground rounded-lg border p-6 text-center">
						<p className="mb-4">No recording available yet</p>
						<Button
							onClick={fetchRecording}
							disabled={loading}
							variant="outline"
						>
							{loading ? "Checking..." : "Check for Recording"}
						</Button>
					</div>
				)}
			</div>

			<div className="mx-auto mt-6 w-full max-w-3xl">
				<TranscriptSummary recordingUrl={recordingLink} />
			</div>
		</div>
	);
}
