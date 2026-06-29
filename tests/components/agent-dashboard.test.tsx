import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import { AgentDashboard } from "@/components/agent-dashboard"

// ─── Mocks ─────────────────────────────────────────────────────────

global.EventSource = class MockEventSource {
  url: string
  readyState = 0
  onopen: ((this: EventSource, ev: Event) => any) | null = null
  onmessage: ((this: EventSource, ev: MessageEvent) => any) | null = null
  onerror: ((this: EventSource, ev: Event) => any) | null = null

  private listeners: Map<string, Array<(e: any) => void>> = new Map()

  constructor(url: string | URL) {
    this.url = String(url)
    // Simulate connection open
    setTimeout(() => {
      this.readyState = 1
      if (this.onopen) this.onopen(new Event("open"))
    }, 0)
  }

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type)!.push(listener)
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    const list = this.listeners.get(type) || []
    const idx = list.indexOf(listener)
    if (idx !== -1) list.splice(idx, 1)
  }

  dispatch(type: string, data: any) {
    const event = {
      type,
      data: JSON.stringify(data),
      lastEventId: "",
      origin: "",
      ports: [],
      source: null,
    } as MessageEvent

    const list = this.listeners.get(type) || []
    list.forEach((fn) => fn(event))
  }

  close() {
    this.readyState = 2
  }
} as any

describe("AgentDashboard", () => {
  const agentId = "agent-test-123"

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
  })

  // ─── Loading State ──────────────────────────────────────────────

  it("renders spinner while loading", () => {
    render(<AgentDashboard agentId={agentId} />)
    expect(screen.getByTestId("agent-dashboard-loading")).toBeInTheDocument()
    expect(screen.getByText(/Loading agent dashboard/i)).toBeInTheDocument()
  })

  // ─── Healthy State ──────────────────────────────────────────────

  it("renders healthy state with all data sections", async () => {
    // Mock health API
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL) => {
      const path = String(url)

      if (path.includes("/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            health: {
              status: "healthy",
              cpu: 42.5,
              memory: 38.2,
              uptime: 3600,
              missedHeartbeats: 0,
              lastHeartbeat: new Date().toISOString(),
            },
          }),
        } as Response
      }

      if (path.includes("/reputation")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reputation: {
              score: 847,
              badge: "Gold",
              totalActions: 1240,
            },
          }),
        } as Response
      }

      if (path.includes("/notifications")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            unreadCount: 3,
            notifications: [],
          }),
        } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    render(<AgentDashboard agentId={agentId} />)

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByTestId("agent-dashboard-loading")).not.toBeInTheDocument()
    })

    // Dashboard rendered
    expect(screen.getByTestId("agent-dashboard")).toBeInTheDocument()

    // Health badge is green (healthy)
    const badge = screen.getByTestId("health-badge")
    expect(badge).toBeInTheDocument()

    // CPU bar present
    expect(screen.getByTestId("cpu-bar")).toBeInTheDocument()

    // Memory bar present
    expect(screen.getByTestId("memory-bar")).toBeInTheDocument()

    // Status label shows "Healthy"
    expect(screen.getByText("Healthy")).toBeInTheDocument()

    // Reputation score shown
    expect(screen.getByText("847")).toBeInTheDocument()

    // Badge shown
    expect(screen.getByText("GOLD")).toBeInTheDocument()

    // Notification bubble
    expect(screen.getByTestId("notification-bubble")).toHaveTextContent("3")

    // Position section (no SSE data yet)
    expect(screen.getByText(/Live Position/i)).toBeInTheDocument()
  })

  // ─── Offline State ────────────────────────────────────────────────

  it("renders offline state when health returns 404", async () => {
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL) => {
      const path = String(url)

      if (path.includes("/health")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ ok: false, error: "Not found" }),
        } as Response
      }

      if (path.includes("/reputation")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reputation: { score: 0, badge: "Unranked", totalActions: 0 },
          }),
        } as Response
      }

      if (path.includes("/notifications")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, unreadCount: 0, notifications: [] }),
        } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    render(<AgentDashboard agentId={agentId} />)

    await waitFor(() => {
      expect(screen.queryByTestId("agent-dashboard-loading")).not.toBeInTheDocument()
    })

    // Dashboard still renders with offline status
    expect(screen.getByTestId("agent-dashboard")).toBeInTheDocument()

    // Status shows Offline
    expect(screen.getByText("Offline")).toBeInTheDocument()

    // Health badge is red
    const badge = screen.getByTestId("health-badge")
    expect(badge).toBeInTheDocument()

    // CPU/Memory bars at 0%
    const cpuBar = screen.getByTestId("cpu-bar")
    expect(cpuBar).toHaveStyle("width: 0%")
  })

  // ─── Error State ────────────────────────────────────────────────

  it("renders error state when all fetches fail", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"))

    render(<AgentDashboard agentId={agentId} />)

    await waitFor(() => {
      expect(screen.queryByTestId("agent-dashboard-loading")).not.toBeInTheDocument()
    })

    expect(screen.getByTestId("agent-dashboard-error")).toBeInTheDocument()
    expect(screen.getByText(/Network error/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument()
  })

  // ─── SSE Position Update ────────────────────────────────────────

  it("updates position via SSE without full re-render", async () => {
    let esInstance: any = null

    const OriginalEventSource = global.EventSource
    global.EventSource = class extends OriginalEventSource {
      constructor(url: string | URL) {
        super(url)
        esInstance = this
      }
    } as any

    vi.mocked(global.fetch).mockImplementation(async (url: string | URL) => {
      const path = String(url)

      if (path.includes("/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            health: {
              status: "healthy",
              cpu: 30,
              memory: 25,
              uptime: 1800,
              missedHeartbeats: 0,
              lastHeartbeat: new Date().toISOString(),
            },
          }),
        } as Response
      }

      if (path.includes("/reputation")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reputation: { score: 500, badge: "Silver", totalActions: 600 },
          }),
        } as Response
      }

      if (path.includes("/notifications")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, unreadCount: 0, notifications: [] }),
        } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    render(<AgentDashboard agentId={agentId} />)

    await waitFor(() => {
      expect(screen.queryByTestId("agent-dashboard-loading")).not.toBeInTheDocument()
    })

    // No position yet
    expect(screen.getByText(/No position data/i)).toBeInTheDocument()

    // Simulate SSE position update
    if (esInstance) {
      esInstance.dispatch("agent.positions.delta", {
        agentId,
        lat: 40.7128,
        lng: -74.006,
        timestamp: new Date().toISOString(),
      })
    }

    await waitFor(() => {
      expect(screen.getByTestId("position-lat")).toHaveTextContent("40.712800")
    })

    expect(screen.getByTestId("position-lng")).toHaveTextContent("-74.006000")

    global.EventSource = OriginalEventSource
  })

  // ─── Health Polling Interval ────────────────────────────────────

  it("polls health every 30 seconds", async () => {
    const fetchMock = vi.mocked(global.fetch)

    fetchMock.mockImplementation(async (url: string | URL) => {
      const path = String(url)

      if (path.includes("/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            health: {
              status: "healthy",
              cpu: 10,
              memory: 20,
              uptime: 0,
              missedHeartbeats: 0,
              lastHeartbeat: new Date().toISOString(),
            },
          }),
        } as Response
      }

      if (path.includes("/reputation")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reputation: { score: 100, badge: "Bronze", totalActions: 10 },
          }),
        } as Response
      }

      if (path.includes("/notifications")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, unreadCount: 0, notifications: [] }),
        } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    render(<AgentDashboard agentId={agentId} />)

    await waitFor(() => {
      expect(screen.queryByTestId("agent-dashboard-loading")).not.toBeInTheDocument()
    })

    // Initial health call
    const healthCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/health")
    )
    expect(healthCalls.length).toBeGreaterThanOrEqual(1)

    // Advance 30 seconds
    vi.advanceTimersByTime(30_000)

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/health")
      )
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ─── Cleanup on Unmount ─────────────────────────────────────────

  it("closes SSE and clears interval on unmount", async () => {
    let closeCalled = false

    const OriginalEventSource = global.EventSource
    global.EventSource = class extends OriginalEventSource {
      close() {
        closeCalled = true
        super.close()
      }
    } as any

    vi.mocked(global.fetch).mockImplementation(async (url: string | URL) => {
      const path = String(url)

      if (path.includes("/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            health: {
              status: "healthy",
              cpu: 0,
              memory: 0,
              uptime: 0,
              missedHeartbeats: 0,
              lastHeartbeat: new Date().toISOString(),
            },
          }),
        } as Response
      }

      if (path.includes("/reputation")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reputation: { score: 0, badge: "Unranked", totalActions: 0 },
          }),
        } as Response
      }

      if (path.includes("/notifications")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, unreadCount: 0, notifications: [] }),
        } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    const { unmount } = render(<AgentDashboard agentId={agentId} />)

    await waitFor(() => {
      expect(screen.queryByTestId("agent-dashboard-loading")).not.toBeInTheDocument()
    })

    unmount()

    expect(closeCalled).toBe(true)

    global.EventSource = OriginalEventSource
  })
})