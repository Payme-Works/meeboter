import { NextResponse } from "next/server";

import { openApiDocument } from "@/lib/swagger";

export async function GET() {
	return NextResponse.json(openApiDocument);
}
