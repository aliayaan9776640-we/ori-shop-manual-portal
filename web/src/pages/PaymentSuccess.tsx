export default function PaymentSuccess() {
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fbfaf5] p-6">
            {/* Background watermark */}
            <img
                src="/ori-logo.png"
                alt=""
                className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.06]"
            />

            <div className="relative z-10 w-full max-w-md rounded-3xl border border-green-200 bg-white/90 p-8 text-center shadow-xl">
                <img
                    src="/ori-logo.png"
                    alt="Ori Barakah Store"
                    className="mx-auto mb-4 h-24 w-24 object-contain"
                />

                <h1 className="text-2xl font-bold text-green-700">
                    Payment Submitted Successfully
                </h1>

                <p className="mt-3 text-sm leading-6 text-gray-600">
                    Your order has been placed successfully. Thank you for shopping with
                    Ori Barakah Store.
                </p>

                <div className="mt-6 rounded-2xl bg-green-50 p-4 text-sm text-green-800">
                    We have received your payment confirmation. Our team will process your
                    order shortly.
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    <a
                        href="/store"
                        className="rounded-xl bg-[#526326] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
                    >
                        Return to Store
                    </a>

                    <a
                        href="/"
                        className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Go to Home Page
                    </a>
                </div>
            </div>
        </div>
    );
}