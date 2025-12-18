import { openApiDocument } from "@/lib/swagger";
import ReactSwagger from "./react-swagger";

// Force dynamic rendering to avoid swagger-ui-react build issues with next/document
export const dynamic = "force-dynamic";

export default async function IndexPage() {
	const spec = openApiDocument;

	return (
		<section className="mx-auto container px-4">
			<ReactSwagger spec={spec as unknown as Record<string, unknown>} />
		</section>
	);
}
