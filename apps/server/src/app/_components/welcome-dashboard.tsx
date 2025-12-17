"use client";

import { File, LogIn, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MultiBotJoinDialog } from "@/app/bots/_components/multi-bot-join-dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import {
	DashboardCard,
	DashboardCardContent,
	DashboardCardDescription,
	DashboardCardHeader,
	DashboardCardLink,
	DashboardCardTitleRow,
} from "./dashboard-card";
import SubscriptionPlansSection from "./subscription-plans-section";

export default function WelcomeDashboard() {
	const { data: session } = useSession();
	const [isMultiBotDialogOpen, setIsMultiBotDialogOpen] = useState(false);

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-3xl font-bold">
					Welcome to Meeboter
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
									<DashboardCard>
										<DashboardCardHeader>
											<DashboardCardTitleRow>Get Started</DashboardCardTitleRow>
											<DashboardCardDescription>
												{session?.user
													? "Deploy intelligent bots to your meetings! Create API keys for programmatic access or quickly join multiple bots to any meeting."
													: "To get started, log-in or sign-up!"}
											</DashboardCardDescription>
										</DashboardCardHeader>
										<DashboardCardContent>
											{session?.user ? (
												<div className="space-y-3">
													<Link href="/api-keys" className="block">
														<Button className="w-full">
															<Plus className="mr-2 h-4 w-4" />
															Create API Key
														</Button>
													</Link>
													<Button
														variant="outline"
														className="w-full"
														onClick={() => setIsMultiBotDialogOpen(true)}
													>
														<Users className="mr-2 h-4 w-4" />
														Multiple Join Bots
													</Button>
												</div>
											) : (
												<Link href="/auth/sign-up">
													<Button>
														Sign Up <LogIn />
													</Button>
												</Link>
											)}
										</DashboardCardContent>
									</DashboardCard>
								</div>

								<div className="min-h-0">
									<DashboardCard className="h-full">
										<DashboardCardHeader>
											<DashboardCardTitleRow
												icon={<File className="text-slate-500" />}
											>
												View our Docs
											</DashboardCardTitleRow>
										</DashboardCardHeader>
										<DashboardCardContent>
											Learn how to deploy engagement bots, configure meeting
											interactions, access recordings, and more in our
											comprehensive documentation!
										</DashboardCardContent>
										<DashboardCardLink href="/docs" external>
											View Documentation
										</DashboardCardLink>
									</DashboardCard>
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

			{/* Multi Bot Join Dialog */}
			{session?.user && (
				<MultiBotJoinDialog
					open={isMultiBotDialogOpen}
					onClose={() => setIsMultiBotDialogOpen(false)}
				/>
			)}
		</div>
	);
}
