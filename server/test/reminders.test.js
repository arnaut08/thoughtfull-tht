import { jest } from "@jest/globals";

process.env.JWT_SECRET = "test-secret";

const rpc = jest.fn();
jest.unstable_mockModule("../src/db.js", () => ({ supabase: { rpc } }));

const { startReminderWorker } = await import("../src/services/reminders.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("startReminderWorker", () => {
  beforeEach(() => rpc.mockReset());

  test("keeps delivering after a failed run", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "connection reset" } })
      .mockResolvedValue({ data: 1, error: null });
    const onError = jest.fn();

    const stop = startReminderWorker({ intervalMs: 10, onError });
    await wait(60);
    stop();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.length).toBeGreaterThan(2);
    expect(rpc).toHaveBeenCalledWith("deliver_due_reminders");
  });

  test("stops calling the database once stopped", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });

    const stop = startReminderWorker({ intervalMs: 10, onError: jest.fn() });
    stop();
    const callsAtStop = rpc.mock.calls.length;
    await wait(40);

    expect(rpc.mock.calls.length).toBe(callsAtStop);
  });
});
