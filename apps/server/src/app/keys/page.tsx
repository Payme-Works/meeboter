"use client";

import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import { api } from "@/trpc/react";
import { columns } from "./components/api-key-columns";
import { CreateApiKeyDialog } from "./components/create-api-key-dialog";
import { ViewLogsDialog } from "./components/view-logs-dialog";

export default function Keys() {
	const [selectedViewLogsKeyId, setSelectedViewLogsKeyId] = useState<
		number | null
	>(null);

	const {
		data: apiKeys,
		isLoading,
		error,
	} = api.apiKeys.listApiKeys.useQuery();

	return (
		<div className="mx-auto container space-y-4 px-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
					<p className="text-muted-foreground">
						Manage your API keys and their permissions.
					</p>
				</div>
				<CreateApiKeyDialog />
			</div>
			<DataTable
				columns={columns(setSelectedViewLogsKeyId)}
				data={apiKeys}
				isLoading={isLoading}
				errorMessage={error?.message}
			/>
			<ViewLogsDialog
				selectedViewLogsKeyId={selectedViewLogsKeyId}
				setSelectedViewLogsKeyId={setSelectedViewLogsKeyId}
			/>
		</div>
	);
}
