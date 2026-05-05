import { pipelinesApi, projectsApi } from "@/lib/api";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: jest.fn().mockResolvedValue({ error: new Error("no session") }),
    },
  },
}));

describe("Black Box Test: Frontend API client", () => {
  const mockResponse = (status: number, body?: unknown) => ({
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body ?? "")),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("returns project list for a valid projects API response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse(200, [{ id: "p1", name: "Demo", description: "desc", owner_id: "u1" }]),
    );

    const projects = await projectsApi.list();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects[0].id).toBe("p1");
    expect(projects[0].name).toBe("Demo");
  });

  it("returns null for delete endpoint with HTTP 204", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse(204, null));

    const result = await pipelinesApi.delete("pipe-1");
    expect(result).toBeNull();
  });

  it("throws API error message for non-OK backend response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse(404, "Project not found"));

    await expect(projectsApi.get("missing-id")).rejects.toThrow("Project not found");
  });
});
