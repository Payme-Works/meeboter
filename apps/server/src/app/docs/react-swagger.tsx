"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Dynamically import SwaggerUI to avoid next/document issues during build
const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
	ssr: false,
	loading: () => (
		<div className="flex items-center justify-center min-h-[400px]">
			<p className="text-muted-foreground">Loading API documentation...</p>
		</div>
	),
});

type Props = {
	spec: Record<string, unknown>;
};

function ReactSwagger({ spec }: Props) {
	const [cssLoaded, setCssLoaded] = useState(false);

	// Load CSS only on client side to avoid build issues
	useEffect(() => {
		// @ts-expect-error - CSS module import
		import("swagger-ui-react/swagger-ui.css").then(() => {
			setCssLoaded(true);
		});
	}, []);

	if (!cssLoaded) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<p className="text-muted-foreground">Loading styles...</p>
			</div>
		);
	}

	return <SwaggerUI spec={spec} />;
}

export default ReactSwagger;
