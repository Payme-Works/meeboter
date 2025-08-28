"use client";

import { File, LogIn, Plus } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import DashboardCard from "./dashboard-card";

export default function WelcomeDashboard() {
	const { data: session } = useSession();

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-3xl font-bold">
					Welcome to Live Boost
					{session?.user?.name ? `, ${session.user.name}` : ""}
				</h1>

				<p className="mt-2 text-gray-600">
					Easily create automated applications that leverage recordings across
					popular video meeting platforms.
				</p>
			</div>

			<div>
				<div className="grid gap-6 lg:grid-cols-2">
					<div className="grid h-full min-h-0 gap-6 lg:col-span-2">
						<div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-6">
							<div className="grid min-h-0 gap-6 md:grid-cols-2">
								<div className="min-h-0">
									<DashboardCard
										title="Get Started"
										description={
											session?.user
												? "To start creating bots, create your first API Key!"
												: "To get started, log-in or sign-up!"
										}
										content={
											session?.user ? (
												<Link href="/keys">
													<Button>
														Create API Key <Plus />
													</Button>
												</Link>
											) : (
												<Link href={`/api/auth/signin?provider=github`}>
													<Button>
														Sign In <LogIn />
													</Button>
												</Link>
											)
										}
									/>
								</div>

								<div className="min-h-0">
									<DashboardCard
										title="View our Docs"
										className="h-full"
										content="To learn more about how to create bots, pull meeting recordings, pull transcriptions and more, view our Documentation!"
										icon={<File className="text-slate-500" />}
										link={{
											type: "EXTERNAL",
											url: "/docs",
											text: "View Documentation",
										}}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
