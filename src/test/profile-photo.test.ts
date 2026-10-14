import { afterEach, expect, it, vi } from "vitest";
import { prepareProfilePhoto } from "../../worker-ui/src/profile-photo";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("rejects unsupported and oversized photos before decoding", async () => {
  await expect(
    prepareProfilePhoto(new File(["<svg/>"], "photo.svg", { type: "image/svg+xml" })),
  ).rejects.toThrow("JPEG, PNG or WebP");
  await expect(
    prepareProfilePhoto(new File([new Uint8Array(10485761)], "photo.jpg", { type: "image/jpeg" })),
  ).rejects.toThrow("10 MB");
});
it("resizes and re-encodes photos before storing them", async () => {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 2048, height: 1024, close }),
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
  ) {
    expect(this.width).toBe(512);
    expect(this.height).toBe(256);
    callback(new Blob(["re-encoded"], { type: "image/jpeg" }));
  });
  const photo = await prepareProfilePhoto(new File(["source"], "photo.png", { type: "image/png" }));
  expect(photo.type).toBe("image/jpeg");
  expect(drawImage).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});
