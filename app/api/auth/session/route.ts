import { authenticateRequest, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();
  return Response.json({ user: { id: auth.userId, username: auth.username, displayName: auth.displayName, role: auth.role }, workspace: { id: auth.workspaceId, name: auth.workspaceName } });
}
