import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/server"

function buildContentDisposition(fileName: string) {
	const sanitized = fileName.replace(/[\r\n"]/g, "_");
	const encoded = encodeURIComponent(fileName);
	return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;

	const file = await prisma.file.findUnique({
		where: { id },
		include: {
			note: {
				include: {
					workspace: {
						select: { userId: true },
					},
				},
			},
		},
	});

	if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

	const isOwner = file.userId === session.user.id;
	const isWorkspaceOwner = file.note?.workspace?.userId === session.user.id;

	if (!isOwner && !isWorkspaceOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const supabase = createAdminClient();
	const isDownload = req.nextUrl.searchParams.get("download") === "1";

	if (!isDownload) {
		const { data: signedData, error: signedError } = await supabase.storage.from("stacknote-files").createSignedUrl(file.path, 60);

		if (signedError || !signedData?.signedUrl) {
			return NextResponse.json({ error: signedError?.message ?? "Failed to create signed URL" }, { status: 500 });
		}

		const redirect = NextResponse.redirect(signedData.signedUrl, { status: 307 });
		redirect.headers.set("Cache-Control", "private, no-store");
		return redirect;
	}

	const { data, error } = await supabase.storage.from("stacknote-files").download(file.path);

	if (error || !data) {
		return NextResponse.json({ error: error?.message ?? "Failed to download file" }, { status: 500 });
	}

	const fileBuffer = Buffer.from(await data.arrayBuffer());

	return new NextResponse(fileBuffer, {
		headers: {
			"Content-Type": file.mimeType || "application/octet-stream",
			"Content-Disposition": buildContentDisposition(file.name || "download"),
			"Content-Length": String(fileBuffer.byteLength),
			"Cache-Control": "private, no-store",
		},
	});
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params


  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      note: {
        include: {
          workspace: {
            select: { userId: true },
          },
        },
      },
    },
  })

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Allow deletion by file owner or workspace owner
  const isOwner = file.userId === session.user.id
  const isWorkspaceOwner = file.note?.workspace?.userId === session.user.id

  if (!isOwner && !isWorkspaceOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabase = createAdminClient()

  try {
    // Remove from storage
    const { error: removeError } = await supabase.storage.from("stacknote-files").remove([file.path])
    if (removeError) {
      // Log and continue to attempt DB cleanup
      console.error("Supabase remove error:", removeError)
    }

    // Delete DB record
    const deleted = await prisma.file.delete({ where: { id } })
    console.log("Deleted file record:", deleted.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
  }
}
