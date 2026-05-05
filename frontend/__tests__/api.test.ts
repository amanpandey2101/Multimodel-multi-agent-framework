import { projectsApi } from '@/lib/api'

// Mock the global fetch function
global.fetch = jest.fn()

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: { access_token: 'fake-token' } }, error: null })),
      refreshSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null }))
    }
  }
}))

describe('White Box Test: API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('projectsApi.list should call the correct endpoint with Auth header', async () => {
    const mockProjects = [{ id: '1', name: 'Test Project' }]
    
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockProjects,
    })

    const result = await projectsApi.list()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/projects/'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer fake-token'
        })
      })
    )
    expect(result).toEqual(mockProjects)
  })

  it('should handle 401 Unauthorized by attempting session refresh', async () => {
    // 1st call: 401 Unauthorized
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })
    
    // 2nd call: The automatic retry (after mock refresh)
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })

    await projectsApi.list()

    // It should have called fetch TWICE: once for the 401 and once for the retry
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

