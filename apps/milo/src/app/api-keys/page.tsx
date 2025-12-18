"use client";

import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { api } from "@/trpc/react";
import { columns } from "./_components/api-key-columns";
import { CreateApiKeyDialog } from "./_components/create-api-key-dialog";
import { ViewLogsDialog } from "./_components/view-logs-dialog";

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
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>API Keys</PageHeaderTitle>
					<PageHeaderDescription>
						Manage your API keys for programmatic bot deployment
					</PageHeaderDescription>
				</PageHeaderContent>

				<PageHeaderActions>
					<CreateApiKeyDialog />
				</PageHeaderActions>
			</PageHeader>

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
