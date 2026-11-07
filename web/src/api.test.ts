import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  checkHealth,
  createPayment,
  getMerchantBalance,
  getPayment,
  submitPayment,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("ConnectRPC JSON client", () => {
  it("sends authenticated ProtoJSON payment creation with an integer string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payment: {
            paymentId: "p1",
            amount: "1200",
            merchantId: "demo-merchant",
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const payment = await createPayment(
      "secret-key",
      "demo-merchant",
      "1200",
      "key-1",
    );
    expect(payment.paymentId).toBe("p1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/payflow.v1.PaymentService/CreatePayment",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-key",
        },
        body: JSON.stringify({
          merchantId: "demo-merchant",
          idempotencyKey: "key-1",
          amount: "1200",
          currency: "JPY",
        }),
        credentials: "omit",
      }),
    );
  });

  it("fetches payment and submission through their existing methods", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            payment: { paymentId: "p1", status: "PAYMENT_STATUS_CREATED" },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await getPayment("key", "p1");
    await submitPayment("key", "p1");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/payflow.v1.PaymentService/GetPayment",
      "/payflow.v1.PaymentService/SubmitPayment",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      paymentId: "p1",
    });
  });

  it("reads the authenticated JPY balance without exposing an error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ currency: "JPY", amount: "300" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: "permission_denied",
              message: "secret database detail",
            }),
            { status: 403 },
          ),
        ),
    );
    expect(await getMerchantBalance("key")).toBe("300");
    await expect(getMerchantBalance("key")).rejects.toThrow("merchant");
  });

  it("rejects missing credentials and maps network failures safely", async () => {
    await expect(getPayment("", "p1")).rejects.toBeInstanceOf(ApiError);
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("postgres://username:password@host"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getPayment("key", "p1")).rejects.toThrow("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports disconnected health without inventing readiness", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );
    expect(await checkHealth("/readyz")).toBe(false);
  });
});
