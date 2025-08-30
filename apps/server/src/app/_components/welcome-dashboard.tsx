"use client";

import { File, LogIn, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import DashboardCard from "./dashboard-card";
import SubscriptionPlansSection from "./subscription-plans-section";

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
					Deploy intelligent bots to boost engagement and productivity in your
					meetings across popular video platforms.
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
												<Link href="/auth/sign-up">
													<Button>
														Sign Up <LogIn />
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
										content="Learn how to deploy engagement bots, configure meeting interactions, access recordings, and more in our comprehensive documentation!"
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

			{/* Subscription Plans Section */}
			<div className="mt-12">
				<SubscriptionPlansSection />
			</div>
		</div>
	);
}
