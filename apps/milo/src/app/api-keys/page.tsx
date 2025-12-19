"use client";

import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
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
	const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

	const [pageSize, setPageSize] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);

	const [selectedViewLogsKeyId, setSelectedViewLogsKeyId] = useState<
		number | null
	>(null);

	const {
		data: apiKeys,
		isLoading,
		error,
	} = api.apiKeys.listApiKeys.useQuery();

	const memoizedColumns = useMemo(() => columns(setSelectedViewLogsKeyId), []);

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
				columns={memoizedColumns}
				data={apiKeys}
				isLoading={isLoading}
				errorMessage={error?.message}
				pageIndex={page - 1}
				pageSize={pageSize}
				onPageIndexChange={(idx) => setPage(idx + 1)}
				onPageSizeChange={setPageSize}
			/>

			<ViewLogsDialog
				selectedViewLogsKeyId={selectedViewLogsKeyId}
				setSelectedViewLogsKeyId={setSelectedViewLogsKeyId}
			/>
		</div>
	);
}
