import { afterEach, expect, it, vi } from "vitest";
import { waitForPushActivation } from "../../shared/push-activation";
afterEach(() => vi.useRealTimers());
function registration(state: string) {
  const worker = Object.assign(new EventTarget(), { state });
  return {
    worker,
    value: {
      active: null,
      installing: worker,
      waiting: null,
    } as unknown as ServiceWorkerRegistration,
  };
}
it("handles activation that finished before observation", async () => {
  const { value } = registration("activated");
  await expect(waitForPushActivation(value)).resolves.toBeUndefined();
});
it("fails when installation becomes redundant", async () => {
  const { value, worker } = registration("installing");
  const result = expect(waitForPushActivation(value)).rejects.toThrow("setup failed");
  worker.state = "redundant";
  worker.dispatchEvent(new Event("statechange"));
  await result;
});
it("bounds setup time instead of leaving Saving stuck", async () => {
  vi.useFakeTimers();
  const { value } = registration("installing");
  const result = expect(waitForPushActivation(value)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
